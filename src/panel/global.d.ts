export {}

declare global {
	const acquireVsCodeApi
	const vscode

	namespace NodeJS {
		interface Global {
			vscode
			fetch
		}
	}
}
