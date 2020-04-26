import { action, computed, intercept, observable, observe, toJS } from 'mobx'
import { Log, Result } from 'sarif'
import { augmentLog, filtersColumn, filtersRow } from '../shared'
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
	public itemsFiltered = [] as Item<T>[]
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

const isMatch = (field: string, keywords: string[]) => !keywords.length || keywords.some(keyword => field.includes(keyword))

export type column = 'File' | 'Line' | 'Message' | 'Baseline' | 'Suppression' | 'Rule'

export class Store {
	@observable.shallow public logs = [] as Log[]

	constructor(state) {
		this.filtersRow = state.filtersRow
		this.filtersColumn = state.filtersColumn
		const setState = () => {
			const {filtersRow, filtersColumn} = this
			const state = { filtersRow: toJS(filtersRow), filtersColumn: toJS(filtersColumn) }
			vscode.postMessage({ command: 'setState', state: JSON.stringify(state, null, '    ') })
			// PostMessage object key order unstable. Stringify is stable.
		}
		// Sadly unable to observe at the root.
		observe(this.filtersRow.Level, setState)
		observe(this.filtersRow.Baseline, setState)
		observe(this.filtersRow.Suppression, setState)
		observe(this.filtersColumn.Columns, setState)

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

	@observable keywords = ''
	@observable filtersRow = filtersRow
	@observable filtersColumn = filtersColumn

	@action public clearFilters() {
		this.keywords = ''
		for (const column in this.filtersRow) {
			for (const value in this.filtersRow[column]) {
				this.filtersRow[column][value] = true
			}
		}
	}

	@observable public sortColumn = 'Line' as column
	@observable public sortDir = SortDir.Asc

	public tabs = ['Locations', 'Rules', 'Logs']
	public selectedTab = observable.box(this.tabs[0])
	public mapTabToGroup = {
		Locations: 'File',
		Rules: 'Rule',
		Logs: 'File', // Temporary incorrect.
	} as Record<string, column>

	@computed public get groupBy() {
		return this.mapTabToGroup[this.selectedTab.get()]
	}

	public groupings = { // aka columns
		'File':        result => result._relativeUri,
		'Line':        result => result._line + '', // Not ever expected to be grouped, but will be searched.
		'Message':     result => result._message,
		'Baseline':    result => result.baselineState,
		'Suppression': result => result._suppression,
		'Rule':        result => `${result._rule?.name ?? '—'}|${result.ruleId ?? '—'}`,
	} as Record<column, (_: Result) => string>

	@computed get visibleColumns() {
		const {filtersColumn, groupBy} = this
		const columnsOptional = Object.entries(filtersColumn.Columns)
			.filter(([_, state]) => state)
			.map(([name, ]) => name)
		return ['File', 'Line', 'Message', ...columnsOptional].filter(col => col !== groupBy) as column[]
	}

	private sortings = {
		'File': result => result._relativeUri?.file ?? '—',
		'Line':	result => result._line,
	} as Record<column, (_: Result) => number | string>

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

	@computed public get groupsFilteredSorted() {
		const {keywords, groupBy, groups, visibleColumns, sortColumn, sortDir} = this
		const mapToList = record => Object.entries(record)
			.filter(([, value]) => value)
			.map(([label,]) => label.toLowerCase())

		const levels = mapToList(this.filtersRow.Level)
		const baselines = mapToList(this.filtersRow.Baseline)
		const suppressions = mapToList(this.filtersRow.Suppression)

		const filterKeywords = keywords.toLowerCase().split(/\s+/).filter(part => part)
		const columns = [groupBy, ...visibleColumns]

		for (const group of groups) {
			group.itemsFiltered = group.items.filter(item => {
				const result = item.data
				if (!levels.includes(result.level)) return false
				if (!baselines.includes(result.baselineState)) return false
				if (!suppressions.includes(result._suppression)) return false
				return columns.some(colName => {
					const selector = this.groupings[colName]
					const field = selector(result).toLowerCase()
					return isMatch(field, filterKeywords)
				})
			})
		}

		groups.forEach(group => {
			const selector = this.sortings[sortColumn] ?? this.groupings[sortColumn]
			group.itemsFiltered.sortBy(item => selector(item.data), sortDir === SortDir.Dsc)
		})
		return groups.filter(group => group.itemsFiltered.length)
	}

	@computed public get rows() {
		const rows = [] as (Group<Result> | Item<Result>)[]
		for (const group of this.groupsFilteredSorted) {
			rows.push(group)
			if (group.expanded) rows.push(...group.itemsFiltered)
		}
		const items = rows.filter(row => row instanceof Item) as Item<Result>[] // Another allocation :-(
		for (const [i, item] of items.entries()) {
			item.prev = items[i - 1]
			item.next = items[i + 1]
		}
		return rows
	}
}
