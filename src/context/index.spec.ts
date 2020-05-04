/// <reference path="../panel/global.d.ts" />
/// Changes to global.d.ts require Mocha restart.
/// Todo: Migrate to tsconfig.files

import assert from 'assert'
import mock from 'mock-require'
import { log } from '../test/mockLog'
import { mockVscode } from '../test/mockVscode'

// Run before any tests. But only want this for 'activate',
// and not affect preceeding tests such as Baser.
// But, if executed `before activate`, then fs is already loaded.
mock('fs', {
	readFileSync: () => JSON.stringify(log)
})

import { activate } from '.'
import { postSelectArtifact, postSelectLog } from '../panel/Store'

describe('activate', () => {
	before(async () => {
		await mockVscode.activateExtension(activate)
	})

	it('can postSelectArtifact', async () => {
		const result = mockVscode.store.results[0]
		await postSelectArtifact(result, result.locations[0].physicalLocation)
		assert.deepEqual(mockVscode.events.splice(0), [
			'showTextDocument file:///folder/file.txt',
			'selection 0 1 0 2',
		])
	})

	it('can postSelectLog', async () => {
		const result = mockVscode.store.results[0]
		await postSelectLog(result)
		assert.deepEqual(mockVscode.events.splice(0), [
			'showTextDocument file:///.sarif/test.sarif',
			// Fix: Region selection is missing.
		])
	})
})
