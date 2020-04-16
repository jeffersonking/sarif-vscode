import { Location, Log } from 'sarif'

// Underscored members are ptional in the source files, but required after preprocessing.
declare module 'sarif' {
	interface Log {
		_uri?: string
		_augmented?: boolean
	}

	interface Run {
		_log?: Log
		_index?: number
		_implicitBase?: string
	}

	interface Result {
		_run?: Run
		_index?: number
		_file?: string
		_path?: string
		_line?: number
		_uri?: string
		_region?: number | [number, number, number, number]
		_rule?: ReportingDescriptor
		_message?: string
	}
}

// console.log(format(`'{0}' was not evaluated for check '{2}' as the analysis is not relevant based on observed metadata: {1}.`, ['x', 'y', 'z']))
function format(template: string, args?: string[]) {
	if (!args) return template
	return template.replace(/{(\d+)}/g, (_, group) => args[group])
}

export function augmentLog(log: Log) {
	if (log._augmented) return
	log._augmented = true
	log.runs.forEach((run, i) => {
		run._log = log
		run._index = i

		let implicitBase = undefined as string[]
		run.results.forEach((result, i) => {
			result._run = run
			result._index = i

			const location = result.locations?.[0]
			const ploc = location?.physicalLocation

			const uri = ploc?.artifactLocation?.uri
			result._uri = uri ?? '—'

			result._region = (() => {
				const region = result.locations?.[0]?.physicalLocation?.region
				if (!region) return undefined

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

			const parts = uri?.split('/')
			implicitBase = // Base calc (inclusive of dash for now)
				implicitBase?.slice(0, Array.commonLength(implicitBase, parts ?? []))
				?? parts
			result._file = parts?.pop() ?? '—'
			result._path = parts?.join('/') ?? '—'
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
