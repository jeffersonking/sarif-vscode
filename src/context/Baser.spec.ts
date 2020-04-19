import assert from 'assert'
import mock from 'mock-require'

mock('vscode', {
	window: {
		showInformationMessage: async (message, ...choices) => choices[0]
	}
})

import { Baser } from './Baser'

describe('Baser', () => {
	it('translates Artifact to Local', async () => {
		const distinctLocalNames = new Map([
			['file1.txt', '/projects/project/file1.txt']
		])
		const distinctArtifactNames = new Map([
			['file1.txt', 'folder/file1.txt']
		])
		const baser = new Baser(distinctLocalNames, { distinctArtifactNames })
		const localPath = await baser.translateToLocalPath('folder/file1.txt')
		assert.equal(localPath, '/projects/project/file1.txt')
	})
})
