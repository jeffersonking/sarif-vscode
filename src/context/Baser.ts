import { Uri, window, workspace } from 'vscode'
import { Store } from '.'
import '../shared/extension'

export class Baser {
	constructor(
		private readonly distinctLocalNames: Map<string, string>,
		private readonly store: Pick<Store, 'distinctArtifactNames'>) {
	}

	private basesArtifactToLocal = new Map<string, string>([ // <artifactPath, localPath>
		// ['https://github.com/microsoft/sarif-sdk/blob/bdbb92f71982685a4cb881b15f9a56274b9b5c7b/src', '/Users/jeff/projects/sarif-sdk/src'],
		// ['folder', '/Users/jeff/projects/vscode-sarif/samplesDemo'],
	])
	private updateBases(artifact: string[], local: string[]) {
		const i = Array.commonLength(artifact.slice().reverse(), local.slice().reverse())
		this.basesArtifactToLocal.set(
			artifact.slice(0, -i).join('/'),
			local.slice(0, -i).join('/'))
	}

	private validatedPathsArtifactToLocal = new Map<string, string>()
	private validatedPathsLocalToArtifact = new Map<string, string>()
	private updateValidatedPaths(artifact: string, local: string) {
		this.validatedPathsArtifactToLocal.set(artifact, local)
		this.validatedPathsLocalToArtifact.set(local, artifact)
	}

	// Other possibilities:
	// * 1 local -> 2 artifacts (localPath still possible exact match of artPath)
	// * Actual 0 artifact match
	// Future:
	// 2:2 matching
	// Notes:
	// If 2 logs have the same path, then likely the same (unless the path is super short)
	// If 2 logs don't have the same path, they can still potentially be the same match
	public translateLocalToArtifact(localPath: string): string { // Future: Ret undefined when certain.
		// Need to refresh on PathMap update.
		if (!this.validatedPathsLocalToArtifact.has(localPath)) {
			const {file} = localPath
			if ((	// If no workspace, then the open docs (at this moment) become the workspace.
					// Overassuming the localPath.name is distinct. There could be 2+ open docs with the same name.
					!workspace.workspaceFolders?.length ||
					this.distinctLocalNames.has(file)
				) &&
				this.store.distinctArtifactNames.has(file)) {

				const artifactPath = this.store.distinctArtifactNames.get(file)
				this.updateValidatedPaths(artifactPath, localPath)
				this.updateBases(artifactPath.split('/'), localPath.split('/'))
			}
		}
		return this.validatedPathsLocalToArtifact.get(localPath) ?? localPath
	}

	private activeInfoMessages = new Set<string>() // Prevent repeat message animations when arrowing through many results with the same uri.
	public async translateArtifactToLocal(artifactPath: string) { // Retval is validated.
		// Temp.
		if (artifactPath.startsWith('sarif:')) return artifactPath

		// Hacky.
		// Note: Uri.parse()
		// Uri.parse('a/b.c')	 => file:///a/b.c
		// Uri.parse('/a/b.c')	 => file:///a/b.c
		// Uri.parse('c:\a\b.c') => c:a%08.c
		const pathExists = async (path: string) => {
			try {
				await workspace.openTextDocument(Uri.parse(path))
			} catch {
				return false
			}
			return true
		}

		const validateUri = async () => {
			// Cache
			if (this.validatedPathsArtifactToLocal.has(artifactPath))
				return this.validatedPathsArtifactToLocal.get(artifactPath)

			// File System Exist
			if (await pathExists(artifactPath))
				return artifactPath

			// Known Bases
			for (const [artifactBase, localBase] of this.basesArtifactToLocal) {
				if (!artifactPath.startsWith(artifactBase)) continue // Just let it fall through?

				const normalizedArtifactPath = `${artifactPath.startsWith('/') ? '' : '/'}${artifactPath}`
				const localPath = normalizedArtifactPath.replace(artifactBase, localBase)

				if (await pathExists(localPath)) {
					this.updateValidatedPaths(artifactPath, localPath)
					return localPath
				}
			}

			// Distinct Project Items
			const {file} = artifactPath
			if (this.distinctLocalNames.has(file) && this.store.distinctArtifactNames.has(file)) {
				const localPath = this.distinctLocalNames.get(file)
				this.updateValidatedPaths(artifactPath, localPath)
				this.updateBases(artifactPath.split('/'), localPath.split('/'))
				return localPath
			}

			// Open Docs
			for (const doc of workspace.textDocuments) {
				const localPath = doc.uri.path
				if (localPath.file !== artifactPath.file) continue
				this.updateValidatedPaths(artifactPath, localPath)
				this.updateBases(artifactPath.split('/'), localPath.split('/'))
				return localPath
			}

			return '' // Can't find uri.
		}

		let validatedUri = await validateUri()
		if (!validatedUri && !this.activeInfoMessages.has(artifactPath)) {
			this.activeInfoMessages.add(artifactPath)
			const choice = await window.showInformationMessage(`Unable to find '${artifactPath.split('/').pop()}'`, 'Locate...')
			this.activeInfoMessages.delete(artifactPath)
			if (choice === 'Locate...') {
				const extension = artifactPath.match(/\.([\w]+)$/)[1]
				const files = await window.showOpenDialog({
					defaultUri: workspace.workspaceFolders?.[0]?.uri,
					filters: { 'Matching file' : [extension] },
					// Consider allowing folders.
				})
				if (!files) return // User cancelled.

				const partsOld = artifactPath.split('/')
				const partsNew = files[0]?.path.split('/')
				if (partsOld.last !== partsNew.last) {
					void window.showErrorMessage(`File names must match: "${partsOld.last}" and "${partsNew.last}"`)
					return
				}
				this.updateBases(partsOld, partsNew)
			}

			validatedUri = await validateUri() // Try again
		}
		return validatedUri
	}
}
