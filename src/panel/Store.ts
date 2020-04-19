import { observable, computed, intercept } from 'mobx'
import { Result, Log } from 'sarif'
import '../shared/extension'
import { augmentLog } from '../shared'

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
	@observable.shallow public logs = [] as Log[]

	constructor() {
		intercept(this.logs, (change: any) => {
			if (change.type !== 'splice') throw new Error(`Unexpected change type. ${change.type}`)
			change.added.forEach(augmentLog)
			return change
		})
	}

	@computed private get runs() {
		return this.logs.map(log => log.runs).flat()
	}

	@computed public get results() {
		return this.runs.map(run => run.results).flat()
	}
	
	@observable public sortColumn = 'Line'
	@observable public sortDir = SortDir.Asc

	public tabs = ['Locations', 'Rules', 'Logs']
	public selectedTab = observable.box(this.tabs[0])
	public mapTabToGroup = {
		Locations: 'File',
		Rules: 'Rule',
		Logs: 'File', // Temporary incorrect.
	}
	@computed public get groupBy() {
		return this.mapTabToGroup[this.selectedTab.get()]
	}

	public groupings = { // aka columns
		File:    result => result._relativeUri,
		Line:    _      => '', // Not ever expected to be grouped.
		Message: result => result._message,
		Rule:    result => `${result._rule?.name}|${result.ruleId}`,
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
}
