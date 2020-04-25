import { IArraySplice, observable, observe } from 'mobx'
import { Log, Result } from 'sarif'
import { commands, ExtensionContext, TextEditorRevealType, Uri, ViewColumn, WebviewPanel, window, workspace } from 'vscode'
import { regionToSelection, Store } from '.'
import { filtersColumn, filtersRow, parseRegion, ResultId, _Region } from '../shared'
import { Baser } from './Baser'
import { loadLogs } from './loadLogs'

export class Panel {
	private title = 'SARIF Result'
	@observable private panel = null as WebviewPanel | null

	constructor(
		readonly context: Pick<ExtensionContext, 'extensionPath' | 'subscriptions'>,
		readonly basing: Baser,
		readonly store: Pick<Store, 'logs' | 'results'>) {
		observe(store.logs, change => {
			const {type, removed, added} = change as unknown as IArraySplice<Log>
			if (type !== 'splice') throw new Error('Only splice allowed on store.logs.')
			this.spliceLogs(removed, added)

			const count = store.results.length
			if (!this.panel) return
			this.panel.title = `${count} ${this.title}${count === 1 ? '' : 's'}`
		})
	}

	public show() {
		if (this.panel) {
			if (!this.panel.active) this.panel.reveal(undefined, true)
			return
		}

		const {context, basing, store} = this
		const {webview} = this.panel = window.createWebviewPanel(
			'Index', `${this.title}s`, { preserveFocus: true, viewColumn: ViewColumn.Two }, // ViewColumn.Besides steals focus regardless of preserveFocus.
			{
				enableScripts: true,
				localResourceRoots: [Uri.file('/'), ...'abcdefghijklmnopqrstuvwxyz'.split('').map(c => Uri.file(`${c}:`))],
				retainContextWhenHidden: true,
			}
		)
		this.panel.onDidDispose(() => this.panel = null)
		
		const src = Uri.file(`${context.extensionPath}/out/panel.js`)
		const defaultState = {
			version: 0,
			filtersRow,
			filtersColumn,
		}
		const state = Store.globalState.get('view', defaultState)
		webview.html = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					connect-src vscode-resource:;
					font-src    data:;
					script-src  vscode-resource: 'unsafe-inline';
					style-src   vscode-resource: 'unsafe-inline';
					">
			</head>
			<body>
				<div id="root"></div>
				<script src="${webview.asWebviewUri(src).toString()}"></script>
				<script>
					vscode = acquireVsCodeApi()
					ReactDOM.render(
						React.createElement(Index, { store: new Store(${JSON.stringify(state)}) }),
						document.getElementById('root'),
					)
				</script>
			</body>
			</html>`

		webview.onDidReceiveMessage(async message => {
			if (!message) return
			const {command} = message
			if (command === 'open') {
				const uris = await window.showOpenDialog({
					defaultUri: workspace.workspaceFolders?.[0]?.uri,
					filters: { 'SARIF files': ['sarif', 'json'] },
				})
				if (!uris) return
				store.logs.push(...await loadLogs(uris))
			}
			if (command === 'removeLog') {
				store.logs.removeWhere(log => log._uri === message.uri)
			}
			if (command === 'select') {
				const [logUri, runIndex, resultIndex] = message.id as ResultId
				const result = store.logs.find(log => log._uri === logUri)?.runs[runIndex]?.results?.[resultIndex]
				if (!result) return

				const [uri, region] = (() => {
					const relatedId = message.relatedLocationId as number
					if (relatedId !== undefined) {
						const rploc = result?.relatedLocations?.find(rloc => rloc.id === +relatedId)?.physicalLocation
						return [rploc?.artifactLocation?.uri, parseRegion(rploc?.region)]
					}
					return [result._uri, result._region]
				})() as [string, _Region]
				if (!uri) return

				const validatedUri = await basing.translateArtifactToLocal(result._uri)
				if (!validatedUri) return

				await this.selectLocal(logUri, validatedUri, region)
			}
			if (command === 'setState') {
				const oldState = Store.globalState.get('view', defaultState)
				const {state} = message
				await Store.globalState.update('view', Object.assign(oldState, JSON.parse(state)))
			}
		}, undefined, context.subscriptions)

		this.spliceLogs([], store.logs)
	}

	public async selectLocal(logUri: string, localUri: string, region: _Region) {
		// Keep/pin active Log as needed
		for (const editor of window.visibleTextEditors.slice()) {
			if (editor.document.uri.toString() !== logUri) continue
			await window.showTextDocument(editor.document, editor.viewColumn)
			await commands.executeCommand('workbench.action.keepEditor')
		}

		const doc = await workspace.openTextDocument(Uri.parse(localUri))
		const editor = await window.showTextDocument(doc, ViewColumn.One, true)

		if (region === undefined) return
		editor.selection = regionToSelection(doc, region)
		editor.revealRange(editor.selection, TextEditorRevealType.InCenterIfOutsideViewport)
	}

	public select(result: Result) {
		if (!result?._id) return // Reduce Panel selection flicker.
		this.panel?.webview.postMessage({ command: 'select', id: result?._id })
	}

	private spliceLogs(removed: Log[], added: Log[]) {
		this.panel?.webview.postMessage({
			command: 'spliceLogs',
			removed: removed.map(log => log._uri),
			added: added.map(log => ({
				uri: log._uri,
				webviewUri: this.panel?.webview.asWebviewUri(Uri.parse(log._uriUpgraded ?? log._uri)).toString(),
			})),
		})
	}
}
