import { spawnSync } from 'child_process'
import * as fs from 'fs'
import { join } from 'path'
import { Log } from 'sarif'
import { eq, gt, lt } from 'semver'
import tmp from 'tmp'
import vscode, { ProgressLocation, Uri } from 'vscode'
import { augmentLog } from '../shared'

export async function loadLogs(uris: Uri[], extensionPath: string) {
	const logs = [] as Log[]
	const urisToUpgrade = [] as Uri[]
	let warnUpgradeExtension = false
	for (const uri of uris) {
		const file = fs.readFileSync(uri.path, 'utf8')
		const log = JSON.parse(file) as Log
		const {version} = log
		if (!version || lt(version, '2.1.0')) {
			urisToUpgrade.push(uri)
		} else if (gt(version, '2.1.0')) {
			warnUpgradeExtension = true
		} else if (eq(version, '2.1.0')) {
			log._uri = uri.toString()
			augmentLog(log)
			logs.push(log)
		}
	}
	if (urisToUpgrade.length) {
		await vscode.window.withProgress(
			{ location: ProgressLocation.Notification, },
			async progress => {
				for (const [i, uri] of urisToUpgrade.entries()) {
					progress.report({ message: `Upgrading ${i + 1} of ${urisToUpgrade.length} log(s)...` })
					// await new Promise(r => setTimeout(r, 3000))
					const tempPath = upgradeLog(uri.path, extensionPath)
					const file = fs.readFileSync(tempPath, 'utf8')
					const log = JSON.parse(file) as Log
					log._uri = `file://${tempPath}`
					log._uriDisplay = uri.toString()
					augmentLog(log)
					logs.push(log)
				}
			}
		)
	}
	if (warnUpgradeExtension) {
		vscode.window.showWarningMessage('Some log versions are newer than this extension.')
	}
	return logs
}

export function upgradeLog(path: string, extensionPath: string) {
	var tempFile = tmp.fileSync()
	try {
		const {error} = spawnSync(join(extensionPath, 'out', 'Sarif.Multitool'), [
			'transform',
			path,
			'--force',
			'--pretty-print',
			'--output', tempFile.name
		], { stdio: 'inherit' })
		if (error) console.log('RESULTERROR', error)
	} catch(e) {
		console.log('ERROR', path, e) // Use malformed sarif to test
	}
	return tempFile.name
}
