import { observable, action, IObservableValue, autorun } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component, Fragment, PureComponent } from 'react'
import * as ReactDOM from 'react-dom'
import { Log, Result } from 'sarif'

import './codicon.css'
import './Index.scss'
import { ResizeHandle } from './Index.ResizeHandle'
import { Store, SortDir, parseLocation } from './Store'
import { runs } from './Store.samples'

class Badge extends PureComponent<{ text: { toString: () => string } }> {
	render() {
		return <span className="svBadge">{this.props.text.toString()}</span>
	}
}

const levelToIcon = {
	error: 'error',
	warning: 'warning',
	info: 'info',
	none: 'issues',
	undefined: 'question',
}

class Icon extends PureComponent<{ name: string, onClick?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void }> {
	render() {
		const {name: iconName, onClick} = this.props
		return <div className={`codicon codicon-${iconName}`} onClick={onClick}></div>
	}
}

@observer class TabBar extends Component<{ titles: string[], selection: IObservableValue<string> }> {
	render() {
		const {titles, selection} = this.props
		return <div className="svTabs">
			{titles.map((title, i) => <div key={i} onClick={() => selection.set(title)}>
				<div className={selection.get() === title ? 'svTabSelected' : ''}>{title}</div>
			</div>)}
		</div>
	}
}

@observer class TabPanel extends Component<{ titles: string[] }> {
	@observable private selected = 0
	render() {
		const {selected} = this
		const {children, titles} = this.props
		const array = React.Children.toArray(children)
		return <>
			<div className="svTabs">
				{titles.map((title, i) => <div key={i} onClick={() => this.selected = i}>
					<div className={selected === i ? 'svTabSelected' : ''}>{title}</div>
				</div>)}
			</div>
			{array[selected]}
		</>
	}
}

@observer class Index extends Component<{ store: Store }> {
	private vscode = acquireVsCodeApi()

	@observable.ref private selectedIndex = 0
	private selectedIndexMax = 0

	constructor(props) {
		super(props)
		autorun(() => {
			const results = this.props.store.resultsGroupedSorted
			this.selectedIndex = 0
			this.vscode.postMessage({ command: 'updateTitle', count: results.length })
		})
	}

	private columnWidths = new Map<string, IObservableValue<number>>([
		['Line', observable.box(70)],
	])
	private columnWidth(name: string) {
		if (!this.columnWidths.has(name)) this.columnWidths.set(name, observable.box(220))
		return this.columnWidths.get(name)
	}

	private detailsPaneHeight = observable.box(400)

	@action.bound private onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		if (!(e.key === 'ArrowUp' || e.key === 'ArrowDown')) return
		if (e.key === 'ArrowUp') {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1)
		}
		if (e.key === 'ArrowDown') {
			this.selectedIndex = Math.min(this.selectedIndexMax, this.selectedIndex + 1)
		}
	}

	render() {
		const {store} = this.props
		if (!store.results.length) {
			return <div className="svZeroData">
				<div onClick={() => this.vscode.postMessage({ command: 'open' })}>
					Open a SARIF file
				</div>
			</div>
		}

		const {groupBy, groupings, groupsSorted, sortColumn, sortDir} = store
		const {detailsPaneHeight} = this
		const columns = Object.keys(groupings).filter(col => col !== groupBy)
		let rowIndex = -1
		let selected = null as Result // Null when index = -1 (after group collapse)

		const listPane = <div tabIndex={0} ref={ref => ref?.focus()} className="svListPane" onKeyDown={this.onKeyDown}>
			<div className="svListHeader">
				<TabBar titles={store.tabs} selection={store.selectedTab} />
				<div className="flexFill"></div>
				<Icon name="collapse-all" onClick={() => store.groupsSorted.forEach(group => group.expanded = false)} />
				<Icon name="folder-opened" onClick={() => this.vscode.postMessage({ command: 'open' })} />
			</div>
			<div className="svListTableScroller">
				<table className="svListTable">
					<colgroup>
						<col width="30" />
						{columns.map((col, i, cols) => {
							if (i === cols.length - 1) return null
							return <col key={col} width={this.columnWidth(col).get()} />
						})}
					</colgroup>
					<thead>
						<tr>
							<td className="svSpacer"><span className="svCell">&nbsp;</span></td>{/* svCell and nbsp to get matching height */}
							{columns.map((col, i, cols) =>
								<td key={col}>
									<span className="svCell svSecondary"
										onClick={action(() => {
											store.sortColumn = col
											store.sortDir = SortDir.reverse(sortDir)
										})}>
											{col}
											{sortColumn === col && <Icon name={sortDir} />}
										</span>
									{i < cols.length - 1 && <ResizeHandle size={this.columnWidth(col)} horizontal />}
								</td>
							)}
						</tr>
					</thead>
					<tbody>
						{groupsSorted.map((group, i) => {
							const {expanded, title, results} = group
							return <Fragment key={i}>
								<tr>{/* Group Row */}
									<td colSpan={columns.length + 1}><span className="svCell svGroup"
										onClick={() => {
											this.selectedIndex = -1
											group.expanded = !expanded
										}}>
										<div className={`twisties codicon codicon-chevron-${expanded ? 'down' : 'right'}`}></div>
										<div className="ellipsis">{title}</div>
										<Badge text={results.length} />
									</span></td>
								</tr>
								{expanded && results.map((result, i) => {
									rowIndex++
									const index = rowIndex // Closure.
									const isSelected = this.selectedIndex === index
									if (isSelected) selected = result
									return <tr key={i} onClick={e => this.selectedIndex = index}
										className={isSelected ? 'svItemSelected' : undefined}>{/* Result Row */}
										
										<td className="svSpacer"></td>
										{columns.map((col, i) =>
											<td key={col}><span className="svCell">
												{i === 0 && <span className={`codicon codicon-${levelToIcon[result.level]}`} />}
												{(() => {
													switch (col) {
														case 'Line':
															return <span>{result._line < 0 ? '—' : result._line}</span>
														case 'File':
															return <span className="ellipsis" title={result._uri}>{result._file}</span>
														case 'Message':
															return <span className="ellipsis">{result._message}</span>
														case 'Rule':
															return <>
																<span>{result._rule?.name ?? '—'}</span>
																<span className="svSecondary">{result.ruleId}</span>
															</>
														default:
															return <span>—</span>
													}
												})()}
											</span></td>
										)}
									</tr>
								})}
							</Fragment>
						})}
					</tbody>	
				</table>
			</div>
		</div>

		this.selectedIndexMax = rowIndex
		return <>
			{listPane}
			<div className="svResizer">
				<ResizeHandle size={detailsPaneHeight} />
			</div>
			<div className="svDetailsPane" style={{ height: detailsPaneHeight.get() }}>
				{selected && <TabPanel titles={['Info', 'Code Flow']}>
					<div className="svDetailsBody --svDetailsBodyInfo">
						<div className="svDetailsMessage">{selected._message}</div>
						<div className="svDetailsInfo">
							<span>Rule Id</span>			<span>{selected.ruleId}</span>
							<span>Rule Name</span>			<span>{selected._rule?.name ?? '—'}</span>
							<span>Rule Description</span>	<span>{selected._rule?.fullDescription?.text ?? selected._rule?.shortDescription?.text ?? '—'}</span>
							<span>Level</span>				<span>{selected.level}</span>
							<span>Kind</span>				<span>{selected.kind ?? '—'}</span>
							<span>Baseline State</span>		<span>{selected.baselineState ?? '—'}</span>
							<span>Locations</span>			<span>{selected.locations?.map((loc, i) => {
								const {uri, line} = parseLocation(loc)
								return <div key={i}>{uri ?? '—'} {line}</div>
							})}</span>
						</div>
					</div>
					<div className="svDetailsBody svDetailsBodyCodeflow">
						{selected.codeFlows
							? selected.codeFlows[0]?.threadFlows?.[0].locations
								.filter(tfLocation => tfLocation.location)
								.map((tfLocation, i) => {
								const {message, physicalLocation} = tfLocation.location
								const uri = new URL(physicalLocation.artifactLocation.uri)
								const fileName = uri.pathname.split('/').pop()
								return <div key={i} className="svListItem">
									<div className="ellipsis">{message?.text ?? '—'}</div>
									<div className="svSecondary">{fileName} [{physicalLocation.region.startLine}]</div>
								</div>
							})
							: <span className="svSecondary">None</span>
						}
					</div>
				</TabPanel>}
			</div>
		</>
	}

	@action.bound private async onMessage(event: MessageEvent) {
		if (event.origin === 'http://localhost:8000') return
		const path = event.data
		if (path) {
			const {store} = this.props
			const response = await fetch(path)
			const log = await response.json() as Log
			store.runs = log.runs
		}
	}

	componentDidMount() {
		addEventListener('message', this.onMessage)
	}

	componentWillUnmount() {
		removeEventListener('message', this.onMessage)
	}
}

const store = new Store()
store.runs = runs
ReactDOM.render(
	<Index store={store} />,
	document.getElementById('root')
)
