import { computed, IArrayWillSplice, intercept, observable } from 'mobx'
import { Log, Result } from 'sarif'
import { commands, DiagnosticSeverity, ExtensionContext, languages, Memento, Range, Selection, TextDocument, ThemeColor, window, workspace } from 'vscode'
import { mapDistinct, _Region } from '../shared'
import '../shared/extension'
import { Baser } from './Baser'
import { loadLogs } from './loadLogs'
import { Panel } from './Panel'

declare module 'vscode' {
	interface Diagnostic {
		_result: Result
	}
}

export const regionToSelection = (doc: TextDocument, region: _Region) => {
	return Array.isArray(region)
		? (region.length === 4
			? new Selection(...region)
			: (() => {
				const [byteOffset, byteLength] = region
				const startColRaw = byteOffset % 16
				const endColRaw = (byteOffset + byteLength) % 16
				return new Selection(
					Math.floor(byteOffset / 16),
					10 + startColRaw + Math.floor(startColRaw / 2),
					Math.floor((byteOffset + byteLength) / 16),
					10 + endColRaw + Math.floor(endColRaw / 2),
				)
			})())
		: (() => {
			const line = doc.lineAt(region)
			return new Selection(
				line.range.start.line,
				line.firstNonWhitespaceCharacterIndex,
				line.range.end.line,
				line.range.end.character,
			)
		})()
	}

export class Store {
	static extensionPath: string | undefined
	static globalState: Memento

	@observable.shallow logs = [] as Log[]
	@computed public get results() {
		const runs = this.logs.map(log => log.runs).flat()
		return runs.map(run => run.results).flat()
	}
	@computed public get distinctArtifactNames() {
		const fileAndUris = this.logs.map(log => [...log._distinct.entries()]).flat()
		return mapDistinct(fileAndUris)
	}

	constructor() {
		intercept(this.logs, objChange => {
			const change = objChange as unknown as IArrayWillSplice<Log>
			change.added = change.added.filter(log => this.logs.every(existing => existing._uri !== log._uri))
			return objChange
		})
	}
}

export async function activate(context: ExtensionContext) {
	const disposables = context.subscriptions
	Store.extensionPath = context.extensionPath
	Store.globalState = context.globalState
	disposables.push(commands.registerCommand('sarif.clearState', () => {
		context.globalState.update('view', undefined)
		commands.executeCommand('workbench.action.reloadWindow')
	}))
	const store = new Store()

	// Boot
	const uris = await workspace.findFiles('.sarif/**/*.sarif')
	store.logs.push(...await loadLogs(uris))

	// Basing
	const urisNonSarif = await workspace.findFiles('**/*', '.sarif') // Ignore folders?
	const fileAndUris = urisNonSarif.map(uri => [uri.path.split('/').pop(), uri.path])  as [string, string][]
	const basing = new Baser(mapDistinct(fileAndUris), store)

	// Panel
	const panel = new Panel(context, basing, store)
	if (uris.length) panel.show()
	disposables.push(commands.registerCommand('sarif.showPanel', () => panel.show()))

	// Suggest In-Project Sarif Files
	;(async () => {
		const urisSarifInWorkspace = await workspace.findFiles('**/*.sarif', '.sarif/**/*.sarif')
		const count = urisSarifInWorkspace.length
		if (!count) return
		if (await window.showInformationMessage(`Discovered ${count} SARIF logs in your workspace.`, 'View in SARIF Panel')) {
			store.logs.push(...await loadLogs(urisSarifInWorkspace))
			panel.show()
		}
	})() // Enabled Temporarily.

	// Diagnostics
	const diagsAll = languages.createDiagnosticCollection('sarif')
	const setDiags = (doc: TextDocument) => {
		if (doc.fileName.endsWith('.git')) return
		const artifactPath = basing.translateLocalToArtifact(doc.uri.path)
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

	// Open Documents <-sync-> Store.logs
	const syncActiveLog = async (doc: TextDocument) => {
		if (!doc.fileName.match(/\.sarif$/i)) return
		store.logs.push(...await loadLogs([doc.uri]))
		panel.show()
	}
	workspace.textDocuments.forEach(syncActiveLog)
	workspace.onDidOpenTextDocument(syncActiveLog)
	workspace.onDidCloseTextDocument(doc => {
		if (!doc.fileName.match(/\.sarif$/i)) return
		store.logs.removeWhere(log => log._uri === doc.uri.toString())
	})

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
				const lines = Buffer.from(contents?.binary, 'base64').toString('hex').match(/.{1,32}/g)
				return lines.reduce((sum, line, i) => {
					const lineNo = ((i + 128) * 16).toString(16).toUpperCase().padStart(8, '0')
					const preview = Buffer.from(line, 'hex').toString('utf8').replace(/(\x09|\x0A|\x0B|\x0C|\x0D|\x1B)/g, '?')
					return `${sum}${lineNo}  ${line.toUpperCase().match(/.{1,2}/g).join(' ')}  ${preview}\n`
				}, '')
			}
			token.isCancellationRequested = true
		}
	})
}

export function deactivate() {}
