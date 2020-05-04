import assert from 'assert'
import { mockVscode } from '../test/mockVscode' // Must come before Baser.
import { Baser } from './Baser'

describe('Baser', () => {
	it('Distinct 1', async () => {
		mockVscode.mockFileSystem = ['/projects/project/file1.txt']
		const distinctLocalNames = new Map([
			['file1.txt', '/projects/project/file1.txt']
		])
		const distinctArtifactNames = new Map([
			['file1.txt', 'folder/file1.txt']
		])
		const baser = new Baser(distinctLocalNames, { distinctArtifactNames })
		const localPath = await baser.translateArtifactToLocal('folder/file1.txt')
		mockVscode.mockFileSystem = undefined

		assert.strictEqual(localPath, '/projects/project/file1.txt') // Should also match file1?
	})

	it('Picker 1', async () => {
		const artifact = 'a/b.c'
		mockVscode.mockFileSystem = ['/x/y/a/b.c']
		const baser = new Baser(new Map(), { distinctArtifactNames: new Map() })
		const localPath = await baser.translateArtifactToLocal(artifact)
		mockVscode.mockFileSystem = undefined

		assert.strictEqual(localPath, '/x/y/a/b.c')
	})

	it('Picker 2', async () => {
		const artifact = '/a/b.c'
		mockVscode.mockFileSystem = ['/x/y/a/b.c']
		const baser = new Baser(new Map(), { distinctArtifactNames: new Map() })
		const localPath = await baser.translateArtifactToLocal(artifact)
		mockVscode.mockFileSystem = undefined

		assert.strictEqual(localPath, '/x/y/a/b.c')
	})

	it('Picker 3', async () => {
		const artifact = '/d/e/f/x/y/a/b.c'
		mockVscode.mockFileSystem = ['/x/y/a/b.c']
		const baser = new Baser(new Map(), { distinctArtifactNames: new Map() })
		const localRebased = await baser.translateArtifactToLocal(artifact)
		mockVscode.mockFileSystem = undefined

		assert.strictEqual(localRebased, '/x/y/a/b.c')
	})
})
