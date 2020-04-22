import { Log } from 'sarif'

export type ResultId = [string, number, number]
export type _Region = number | [number, number] | [number, number, number, number]

// Underscored members are ptional in the source files, but required after preprocessing.
declare module 'sarif' {
	interface Log {
		_uri?: string
		_uriDisplay?: string
		_Uri?: { fsPath: string } // Like the vscode.Uri, minus the hard dependency.
		_augmented?: boolean
		_distinct?: Map<string, string> // Technically per Run, practially does't matter right now.
	}

	interface Run {
		_implicitBase?: string
	}

	interface Result {
		_id?: ResultId
		_uri?: string
		_relativeUri?: string
		_region?: _Region
		_line?: number
		_rule?: ReportingDescriptor
		_message?: string
	}
}

// console.log(format(`'{0}' was not evaluated for check '{2}' as the analysis is not relevant based on observed metadata: {1}.`, ['x', 'y', 'z']))
function format(template: string, args?: string[]) {
	if (!args) return template
	return template.replace(/{(\d+)}/g, (_, group) => args[group])
}

export function mapDistinct(pairs: [string, string][]): Map<string, string> {
	const distinct = new Map<string, string>()
	for (const [key, value] of pairs) {
		if (distinct.has(key)) {
			const otherValue = distinct.get(key)
			if (value !== otherValue) distinct.set(key, undefined)
		} else {
			distinct.set(key, value)
		}
	}
	for (const [key, value] of distinct) {
		if (!value) distinct.delete(key)
	}
	return distinct
}

export function augmentLog(log: Log) {
	if (log._augmented) return
	log._augmented = true
	const fileAndUris = [] as [string, string][]
	log.runs.forEach((run, runIndex) => {

		let implicitBase = undefined as string[]
		run.results.forEach((result, resultIndex) => {
			result._id = [log._uri, runIndex, resultIndex]

			const ploc = result.locations?.[0]?.physicalLocation

			let uri = ploc?.artifactLocation?.uri

			// Special handling of binary files.
			const artIndex = ploc?.artifactLocation?.index
			const artifact = run.artifacts?.[artIndex]
			const contents = artifact?.contents
			if (contents?.text || contents?.binary) {
				uri = encodeURI(`sarif:${encodeURIComponent(log._uri)}/${runIndex}/${artIndex}/${artifact.location?.uri.file ?? 'Untitled'}`)
			}

			result._uri = uri
			const parts = uri?.split('/')
			implicitBase = // Base calc (inclusive of dash for now)
				implicitBase?.slice(0, Array.commonLength(implicitBase, parts ?? []))
				?? parts
			const file = parts?.pop()
			if (file && uri) {
				fileAndUris.push([file, uri])
			}

			result._region = (() => {
				const region = ploc?.region
				if (!region) return undefined

				const {byteOffset, byteLength} = region
				if (byteOffset !== undefined && byteLength !== undefined) return [byteOffset, byteLength] as [number, number]

				let {startLine, startColumn, endLine, endColumn} = region
				if (!startLine) return undefined // Lines are 1-based so no need to check undef.

				startLine--
				if (!startColumn) return startLine

				startColumn--
				if (endColumn) endColumn--
				if (endLine) endLine--
				return [
					startLine,
					startColumn,
					endLine ?? startLine,
					endColumn ?? (startColumn + 1)
				] as [number, number, number, number]
			})()
			result._line = result._region?.[0] ?? result._region ?? -1 // _line is sugar for _region

			result._rule = run.tool.driver.rules?.[result.ruleIndex] // If result.ruleIndex is undefined, that's okay.
			const template = result._rule?.messageStrings?.[result.message.id].text ?? result.message.text ?? '—'
			result._message = format(template, result.message.arguments)
		})

		run._implicitBase = implicitBase?.join('/')
		for (const result of run.results) {
			result._relativeUri = result._uri?.replace(run._implicitBase , '') ?? '' // For grouping, Empty works more predictably than undefined
		}
	})
	log._distinct = mapDistinct(fileAndUris)
}
