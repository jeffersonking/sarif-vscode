import * as fs from 'fs'
import { computed, observable } from 'mobx'
import { Log, Result } from 'sarif'
import { commands, DiagnosticSeverity, ExtensionContext, languages, Range, Selection, TextDocument, ThemeColor, Uri, window, workspace } from 'vscode'
import { augmentLog, mapDistinct } from '../shared'
import '../shared/extension'
import { Baser } from './Baser'
import { Panel } from './Panel'

declare module 'vscode' {
	interface Diagnostic {
		_result: Result
	}
}

export const regionToSelection = (doc: TextDocument, region: number | [number, number, number, number]) =>
	Array.isArray(region)
		? new Selection(...region)
		: (() => {
			const line = doc.lineAt(region)
			return new Selection(
				line.range.start.line,
				line.firstNonWhitespaceCharacterIndex,
				line.range.end.line,
				line.range.end.character,
			)
		})()

export class Store {
	@observable.shallow logUris= [] as Uri[]
	@computed({ keepAlive: true }) get logs() { 
		return this.logUris.map(uri => {
			const file = fs.readFileSync(uri.path, 'utf8')
			const log = JSON.parse(file) as Log
			log._uri = uri.toString()
			augmentLog(log)
			return log
		})
	}
	@computed public get results() {
		const runs = this.logs.map(log => log.runs).flat()
		return runs.map(run => run.results).flat()
	}
	@computed public get distinctArtifactNames() {
		const fileAndUris = this.logs.map(log => [...log._distinct.entries()]).flat()
		return mapDistinct(fileAndUris)
	}
}

export async function activate(context: ExtensionContext) {
	const disposables = context.subscriptions
	const store = new Store()

	// Boot
	const uris = await workspace.findFiles('.sarif/**/*.sarif')
	store.logUris.replace(uris)

	// Basing
	const urisNonSarif = await workspace.findFiles('**/*', '.sarif') // Ignore folders?
	const fileAndUris = urisNonSarif.map(uri => [uri.path.split('/').pop(), uri.path])  as [string, string][]
	const basing = new Baser(mapDistinct(fileAndUris), store)

	// Panel
	const panel = new Panel(context, basing, store)
	if (uris.length) panel.show()
	disposables.push(commands.registerCommand('sarif.showResultsPanel', () => panel.show()))

	// Diagnostics
	const diagsAll = languages.createDiagnosticCollection('sarif')
	const setDiags = (doc: TextDocument) => {
		if (doc.fileName.endsWith('.git')) return
		const artifactPath = basing.translateToArtifactPath(doc.uri.path)
		const diags = store.results
			.filter(result => result._uri === artifactPath)
			.map(result => ({
				_result: result,
				message: result._message,
				range: regionToSelection(doc, result._region),
				severity: {
						error: DiagnosticSeverity.Error,
						warning: DiagnosticSeverity.Warning,
					}[result.level] ?? DiagnosticSeverity.Information // note, none, undefined.
			}) )
		diagsAll.set(doc.uri, diags)
	}
	workspace.textDocuments.forEach(setDiags)
	workspace.onDidOpenTextDocument(setDiags)
	workspace.onDidCloseTextDocument(doc => diagsAll.delete(doc.uri)) // Spurious *.git deletes don't hurt.

	// Actions/Decorations for Call Trees
	const decorationType = window.createTextEditorDecorationType({
		after: { color: new ThemeColor('problemsWarningIcon.foreground') }
	})
	languages.registerCodeActionsProvider('*', {
		provideCodeActions: (doc, _range, context) => {
			if (context.only) return
			const result = context.diagnostics[0]?._result
			panel.select(result)

			const editor = window.visibleTextEditors.find(editor => editor.document === doc)
			if (!editor) return // When would editor be undef?
			const lines = result?.codeFlows?.[0]?.threadFlows?.[0]?.locations.map(tfl => tfl.location?.physicalLocation?.region?.startLine) ?? [] // Can do region conversion here.
			const ranges = lines.map(lineNo => {
				const max = Number.MAX_SAFE_INTEGER
				const line = Math.max(0, lineNo - 1)
				return editor.document.validateRange(new Range(line, max, line, max))
			})
			const maxEol = Math.max(...ranges.map(range => range.end.character)) + 4 // + for Padding
			const options = ranges.map((range, i) => ({ // Hoist?
				range,
				hoverMessage: `Frame ${i}`,
				renderOptions: { after: { contentText: ` ${'┄'.repeat(maxEol - range.end.character)} Frame ${i}`, } }, // ←
			}))
			editor.setDecorations(decorationType, options)

			return []
		}
	})

	// Virtual Documents
	workspace.registerTextDocumentContentProvider('sarif', {
		provideTextDocumentContent: (uri, token) => {
			const [logUriEncoded, runIndex, artifactIndex] = uri.path.split('/')
			const logUri = decodeURIComponent(logUriEncoded)
			const artifact = store.logs.find(log => log._uri === logUri)?.runs[runIndex]?.artifacts?.[artifactIndex]
			const contents = artifact?.contents
			if (contents?.text) return contents?.text
			if (contents?.binary) {
				return [...Buffer.from(contents?.binary, 'base64').toString()].map((char, i) => {
				const byte = char.charCodeAt(0).toString(16).padStart(2, '0')
				const space = i % 2 === 1 ? ' ' : ''
				const newline = i % 16 === 15 ? '\n' : ''
				return `${byte}${space}${newline}`
			}).join('')
		}
			token.isCancellationRequested = true
		}
	})
}

export function deactivate() {}
