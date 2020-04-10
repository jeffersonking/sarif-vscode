import { observable, computed } from 'mobx'
import { Result, Run, Location } from 'sarif'
import './extension'

declare module 'sarif' {
	interface Run {
		_augmented?: boolean
	}

	// Underscored members are ptional in the source files, but required after preprocessing.
	interface Result {
		_file?: string
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
		if (run._augmented) {
			console.warn('run already processed', run)
			return
		}
		run._augmented = true

		run.results.forEach(result => {
			const {uri, line} = parseLocation(result.locations?.[0])
			result._uri = uri ?? '—'
			result._line = line

			// Note: new URL('folder/file1.txt') fails
			// result._file = (uri && new URL(uri).pathname.split('/').pop()) ?? '—'

			result._file = uri?.split('/').pop() ?? '—'
			result._rule = run.tool.driver.rules?.[result.ruleIndex] // If result.ruleIndex is undefined, that's okay.
			const template = result._rule?.messageStrings?.[result.message.id].text ?? result.message.text ?? '—'
			result._message = format(template, result.message.arguments)
		})
	})
}

export enum SortDir {
	Asc = 'arrow-down',
	Dsc = 'arrow-up',
}
export namespace SortDir {
	export function reverse(dir: SortDir) {
		return dir === SortDir.Asc ? SortDir.Dsc : SortDir.Asc
	}
}

class Group {
	@observable expanded = true
	public results = [] as Result[]
	constructor(readonly title: string) {}
}

export class Store {
	@observable.ref public runs = []
	@computed public get results() {
		augmentRuns(this.runs)
		return this.runs.map(run => run.results).flat()
	}
	
	@observable public sortColumn = 'Line'
	@observable public sortDir = SortDir.Asc

	public tabs = ['Locations', 'Rules']
	public selectedTab = observable.box(this.tabs[0])
	public mapTabToGroup = {
		Locations: 'File',
		Rules: 'Rule',
	}
	@computed public get groupBy() {
		return this.mapTabToGroup[this.selectedTab.get()]
	}

	public groupings = { // aka columns
		File:    result => result._file,
		Line:    _      => '', // Not ever expected to be grouped.
		Rule:    result => result.ruleId, // React.renderToString
		Message: result => result._message,
	} as Record<string, (_: Result) => string>

	private sortings = {
		Line:	 result => result._line,
		Rule:    result => result._rule?.name ?? '—',
	} as Record<string, (_: Result) => number | string>

	@computed private get groups() {
		const selector = this.groupings[this.groupBy]
		const map = new Map<string, Group>()
		this.results.forEach(result => {
			const key = selector(result)
			if (!map.has(key)) map.set(key, new Group(key))
			map.get(key).results.push(result)
		})
		return [...map.values()].sortBy(g => g.results.length, true) // High to low.
	}

	@computed public get groupsSorted() {
		const {groups, sortColumn, sortDir} = this
		groups.forEach(group => {
			const selector = this.sortings[sortColumn] ?? this.groupings[sortColumn]
			group.results.sortBy(selector, sortDir === SortDir.Dsc)
		})
		return groups.slice() // slice() as an indicator of change.
	}

	@computed public get resultsGroupedSorted() {
		return this.groupsSorted.map(g => g.results).flat()
	}
}
