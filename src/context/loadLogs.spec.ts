import assert from 'assert'
import mock from 'mock-require'

const progress = {
	report: data => {
		console.log(data)
	}
}
class Uri {
	static parse(value) { return new Uri(value) }
	constructor(readonly value) {}
	get path() { return this.value.replace('file://', '') }
	toString() { return this.value }
	scheme; authority; query; fragment; fsPath; with; toJSON // Stubs
}
mock('vscode', {
	ProgressLocation: { Notification: 15 },
	Uri,
	window: {
		showWarningMessage: () => {},
		withProgress: async (_options, task) => await task(progress)
	}
})

import { loadLogs } from './loadLogs'

describe('loadLogs', () => {
	it('Works', async () => {
		const uris = [
			`file:///Users/jeff/projects/sarif-vscode/samplesDemo/.sarif/Double.sarif`,
			`file:///Users/jeff/projects/sarif-vscode/samplesDemo/.sarif/Single.sarif`,
			`file:///Users/jeff/projects/sarif-vscode/samplesDemo/.sarif/EmbeddedContent.sarif`,
			`file:///Users/jeff/projects/sarif-vscode/samplesDemo/.sarif/bad-eval-with-code-flow.sarif`,
			`file:///Users/jeff/projects/sarif-vscode/samplesDemo/.sarif/oldLog.sarif`,
		].map(path => Uri.parse(path))
		const logs = await loadLogs(uris, process.cwd())
		assert.strictEqual(logs.every(log => log.version === '2.1.0'), true)
	})
})
