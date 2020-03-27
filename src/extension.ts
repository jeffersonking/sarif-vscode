import { commands, ExtensionContext, window, ViewColumn } from 'vscode'

export function activate(context: ExtensionContext) {
	const disposables = context.subscriptions

	disposables.push(
		commands.registerCommand('extension.helloWorld', () => {
			// window.showInformationMessage('Hello World 2!')

			const panel = window.createWebviewPanel(
				'viewType', 'Hello', ViewColumn.One,
				{ enableScripts: true },
			)
			panel.webview.html = `Hello`
			panel.webview.onDidReceiveMessage(message => {
				console.log(message)
			}, undefined, disposables)
		}),
	)
}

export function deactivate() {}
