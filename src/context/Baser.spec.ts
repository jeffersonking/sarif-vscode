import assert from 'assert'
import mock from 'mock-require'

const mockEnv = {
	fileSystem: []
}

mock('vscode', {
	Uri: {
		parse: path => ({ path })
	},
	window: {
		showErrorMessage: async message => console.error(message),
		showInformationMessage: async (message, ...choices) => choices[0], // = [0] => 'Locate...'
		showOpenDialog: async () => mockEnv.fileSystem[0] ? [{ path: mockEnv.fileSystem[0] }] : []
	},
	workspace: {
		openTextDocument: async uri => {
			if (mockEnv.fileSystem.includes(uri.path)) { return }
			throw new Error()
		},
		textDocuments: []
	}
})

import { Baser } from './Baser'

describe('Baser', () => {
	it('Distinct 1', async () => {
		mockEnv.fileSystem = ['/projects/project/file1.txt']
		const distinctLocalNames = new Map([
			['file1.txt', '/projects/project/file1.txt']
		])
		const distinctArtifactNames = new Map([
			['file1.txt', 'folder/file1.txt']
		])
		const baser = new Baser(distinctLocalNames, { distinctArtifactNames })
		const localPath = await baser.translateArtifactToLocal('folder/file1.txt')
		assert.strictEqual(localPath, '/projects/project/file1.txt') // Should also match file1?
	})

	it('Picker 1', async () => {
		const artifact = 'a/b.c'
		mockEnv.fileSystem = ['/x/y/a/b.c']

		const baser = new Baser(new Map(), { distinctArtifactNames: new Map() })
		const localPath = await baser.translateArtifactToLocal(artifact)
		assert.strictEqual(localPath, '/x/y/a/b.c')
	})

	it('Picker 2', async () => {
		const artifact = '/a/b.c'
		mockEnv.fileSystem = ['/x/y/a/b.c']

		const baser = new Baser(new Map(), { distinctArtifactNames: new Map() })
		const localPath = await baser.translateArtifactToLocal(artifact)
		assert.strictEqual(localPath, '/x/y/a/b.c')
	})

	it('Picker 3', async () => {
		const artifact = '/d/e/f/x/y/a/b.c'
		mockEnv.fileSystem = ['/x/y/a/b.c']

		const baser = new Baser(new Map(), { distinctArtifactNames: new Map() })
		const localRebased = await baser.translateArtifactToLocal(artifact)
		assert.strictEqual(localRebased, '/x/y/a/b.c')
	})
})
