import * as path from 'path'
import { augmentRuns } from '../src-shared'

export async function activate(context: ExtensionContext) {
	const title = 'SARIF Result'
	const disposables = context.subscriptions
	const panel = window.createWebviewPanel(
		'Index', `${'SARIF Result'}s`, ViewColumn.Two,
		{
			enableScripts: true,
			localResourceRoots: [Uri.file('/')],
			retainContextWhenHidden: true,
		}
	)
	const {webview} = panel

	const indexJs = Uri
		.file(path.join(context.extensionPath, 'src-view-dev', 'index.js'))
		.with({ scheme: 'vscode-resource' })
	webview.html = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="
				default-src 'none';
				connect-src vscode-resource:;
				img-src     https:;
				font-src    data:;
				script-src  'unsafe-eval' 'unsafe-inline' vscode-resource:;
				style-src   vscode-resource: 'unsafe-inline';
				">
		</head>
		<body>
			<div id="root"></div>
			<script src="${indexJs}"></script>
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
			if (files) {
				webview.postMessage(webview.asWebviewUri(files[0]).toString())
			}
		}
		if (command === 'updateTitle') {
			const {count} = message
			panel.title = `${count} ${title}${count === '1' ? '' : 's'}`
		}

	}, undefined, disposables)
}

export function deactivate() {}
