import { computed, intercept, observable } from 'mobx'
import { Log, Result } from 'sarif'
import { augmentLog } from '../shared'
import '../shared/extension'

export enum SortDir {
	Asc = 'arrow-down',
	Dsc = 'arrow-up',
}
export namespace SortDir {
	export function reverse(dir: SortDir) {
		return dir === SortDir.Asc ? SortDir.Dsc : SortDir.Asc
	}
}

export class Group<T> {
	private static instances = 0
	public readonly key = Group.instances++
	@observable expanded = true
	public items = [] as Item<T>[]
	constructor(readonly title: string) {}
}

export class Item<T> {
	private static instances = 0
	public readonly key = Item.instances++
	public group?: Group<T>
	public prev?: Item<T>
	public next?: Item<T>
	constructor(readonly data: T) {}
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

	@observable.ref public selectedItem = null as Item<Result>

	@computed public get items() {
		return this.results.map(result => new Item(result))
	}

	@computed private get groups() {
		const selector = this.groupings[this.groupBy]
		const map = new Map<string, Group<Result>>()
		this.items.forEach(item => {
			const key = selector(item.data)
			if (!map.has(key)) map.set(key, new Group(key))
			const group = map.get(key)
			group.items.push(item)
			item.group = group
		})
		return [...map.values()].sortBy(g => g.items.length, true) // High to low.
	}

	@computed public get groupsSorted() {
		const {groups, sortColumn, sortDir} = this
		groups.forEach(group => {
			const selector = this.sortings[sortColumn] ?? this.groupings[sortColumn]
			group.items.sortBy(item => selector(item.data), sortDir === SortDir.Dsc)
		})
		return groups.slice() // slice() as an indicator of change.
	}

	@computed public get rows() {
		const rows = [] as (Group<Result> | Item<Result>)[]
		for (const group of this.groupsSorted) {
			rows.push(group)
			if (group.expanded) rows.push(...group.items)
		}
		const items = rows.filter(row => row instanceof Item) as Item<Result>[] // Another allocation :-(
		for (const [i, item] of items.entries()) {
			item.prev = items[i - 1]
			item.next = items[i + 1]
		}
		return rows
	}
}
