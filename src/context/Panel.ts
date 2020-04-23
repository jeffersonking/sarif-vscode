import { observable, observe, IArraySplice } from 'mobx'
import { Result, Log } from 'sarif'
import { ExtensionContext, TextEditorRevealType, Uri, ViewColumn, WebviewPanel, window, workspace } from 'vscode'
import { regionToSelection, Store } from '.'
import { ResultId } from '../shared'
import { Baser } from './Baser'
import { loadLogs } from './loadLogs'

export class Panel {
	private title = 'SARIF Result'
	@observable private panel = null as WebviewPanel | null

	constructor(
		readonly context: Pick<ExtensionContext, 'extensionPath' | 'subscriptions'>,
		readonly basing: Baser,
		readonly store: Pick<Store, 'logs' | 'results'>,
		readonly extensionPath: string) {
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
			this.panel.reveal()
			return
		}

		const {context, basing, store} = this
		const {webview} = this.panel = window.createWebviewPanel(
			'Index', `${this.title}s`, ViewColumn.Two,
			{
				enableScripts: true,
				localResourceRoots: [Uri.file('/'), Uri.file('c:')],
				retainContextWhenHidden: true,
			}
		)
		this.panel.onDidDispose(() => this.panel = null)
		
		const src = Uri.file(`${context.extensionPath}/out/panel.js`)
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
					ReactDOM.render(
						React.createElement(Index, { store: new Store() }),
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
				store.logs.push(...await loadLogs(uris, this.extensionPath))
			}
			if (command === 'removeLog') {
				store.logs.removeWhere(log => log._uri === message.uri)
			}
			if (command === 'select') {
				const [logUri, runIndex, resultIndex] = message.id as ResultId
				const result = store.logs.find(log => log._uri === logUri)?.runs[runIndex]?.results?.[resultIndex]
				if (!result || !result._uri) return
				const validatedUri = await basing.translateToLocalPath(result._uri)
				if (!validatedUri) return

				const doc = await workspace.openTextDocument(Uri.parse(validatedUri))
				const editor = await window.showTextDocument(doc, ViewColumn.One, true)

				if (result._region === undefined) return
				editor.selection = regionToSelection(doc, result._region)
				editor.revealRange(editor.selection, TextEditorRevealType.InCenterIfOutsideViewport)
			}
		}, undefined, context.subscriptions)

		this.spliceLogs([], store.logs)
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
				webviewUri: this.panel?.webview.asWebviewUri(Uri.parse(log._uri)).toString(),
			})),
		})
	}
}
