import { autorun, observable } from 'mobx'
import { Result } from 'sarif'
import { ExtensionContext, TextEditorRevealType, Uri, ViewColumn, WebviewPanel, window, workspace } from 'vscode'
import { regionToSelection, Store } from '.'
import { ResultId } from '../src-shared'
import { Baser } from './Baser'

export class Panel {
	private title = 'SARIF Result'
	@observable private panel = null as WebviewPanel | null

	constructor(
		readonly context: Pick<ExtensionContext, 'extensionPath' | 'subscriptions'>,
		readonly basing: Baser,
		readonly store: Pick<Store, 'logs' | 'logUris' | 'results'>) {
		autorun(() => {
			const count = this.store.results.length
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
				localResourceRoots: [Uri.file('/')],
				retainContextWhenHidden: true,
			}
		)
		this.panel.onDidDispose(() => this.panel = null)

		webview.html = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					connect-src vscode-resource:;
					font-src    data:;
					script-src  vscode-resource:;
					style-src   vscode-resource: 'unsafe-inline';
					">
			</head>
			<body>
				<div id="root"></div>
				<script src="vscode-resource:${context.extensionPath}/src-view-dev/index.js"></script>
			</body>
			</html>`

		webview.onDidReceiveMessage(async message => {
			if (!message) return
			const {command} = message
			if (command === 'open') {
				const files = await window.showOpenDialog({
					defaultUri: workspace.rootPath && Uri.file(workspace.rootPath),
					filters: { 'SARIF files': ['sarif'] },
				})
				if (!files) return
				webview.postMessage({ // Migrate to Log sync.
					uri: files[0].path,
					webviewUri: webview.asWebviewUri(files[0]).toString()
				})
			}
			if (command === 'select') {
				const [logUri, runIndex, resultIndex] = message.id as ResultId
				const result = store.logs.find(log => log._uri === logUri)?.runs[runIndex]?.results?.[resultIndex]
				if (!result || result._uri === '—') return
				const validatedUri = await basing.translateToLocalPath(result._uri)
				if (!validatedUri) return

				const doc = await workspace.openTextDocument(validatedUri)
				const editor = await window.showTextDocument(doc, ViewColumn.One, true)

				if (result._region === undefined) return
				editor.selection = regionToSelection(doc, result._region)
				editor.revealRange(editor.selection, TextEditorRevealType.InCenterIfOutsideViewport)
			}
		}, undefined, context.subscriptions)

		this.replaceLogs(store.logUris)
	}

	private replaceLogs(uris: string[]) {
		this.panel?.webview.postMessage({
			command: 'replaceLogs',
			uris: uris.map(uri => ({
				uri,
				webviewUri: this.panel?.webview.asWebviewUri(Uri.file(uri)).toString(),
			}))
		})	
	}

	public addLog(uri: Uri) {
		this.panel?.webview.postMessage({
			command: 'addLog',
			uri: uri.path,
			webviewUri: this.panel.webview.asWebviewUri(uri).toString(),
		})
	}

	public select(result: Result) {
		this.panel?.webview.postMessage({ command: 'select', id: result._id })
	}
}
