import { Run, Location } from 'sarif'

declare module 'sarif' {
	interface Log {
		_uri?: string
	}

	interface Run {
		_augmented?: boolean
		_implicitBase?: string
	}

	// Underscored members are ptional in the source files, but required after preprocessing.
	interface Result {
		_file?: string
		_path?: string
		_line?: number
		_uri?: string
		_rule?: ReportingDescriptor
		_message?: string
	}
}

function format(template: string, args?: string[]) {
	if (!args) return template
	return template.replace(/{(\d+)}/g, (_, group) => args[group])
}
// console.log(format(`'{0}' was not evaluated for check '{2}' as the analysis is not relevant based on observed metadata: {1}.`, ['x', 'y', 'z']))

export function parseLocation(location?: Location) {
	const ploc = location?.physicalLocation
	const uri = ploc?.artifactLocation?.uri
	const line = ploc?.region?.startLine ?? -1
	return { uri, line }
}

export function augmentRuns(runs: Run[]) {
	runs.forEach(run => {
		if (run._augmented) return

		run._augmented = true
		let implicitBase = undefined as string[]

		run.results.forEach(result => {
			const {uri, line} = parseLocation(result.locations?.[0])
			result._uri = uri ?? '—'
			result._line = line

			// Note: new URL('folder/file1.txt') fails
			// result._file = (uri && new URL(uri).pathname.split('/').pop()) ?? '—'

			const parts = uri?.split('/')
			implicitBase = // Base calc (inclusive of dash for now)
				implicitBase?.slice(0, Array.commonLength(implicitBase, parts))
				?? parts

			result._file = parts.pop() ?? '—'
			result._path = parts.join('/') ?? '—'
			result._rule = run.tool.driver.rules?.[result.ruleIndex] // If result.ruleIndex is undefined, that's okay.
			const template = result._rule?.messageStrings?.[result.message.id].text ?? result.message.text ?? '—'
			result._message = format(template, result.message.arguments)
		})

		run._implicitBase = implicitBase.join('/')
		for (const result of run.results) {
			result._path = result._uri.replace(run._implicitBase + '/', '') // End slash ok?
		}
	})
}
