import { action, IObservableValue, observable } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component, CSSProperties, PureComponent } from 'react'
import { Result } from 'sarif'
import { FilterKeywordContext } from './Index'
import './Index.widgets.scss'

export function css(...names: (string | false)[]) {
	return names.filter(name => name).join(' ')
}

export class Badge extends PureComponent<{ text: { toString: () => string } }> {
	render() {
		return <span className="svBadge">{this.props.text.toString()}</span>
	}
}

@observer export class Checkrow extends PureComponent<{ label: string, state: Record<string, boolean>}> {
	render() {
		const {label, state} = this.props
		return <div className="svCheckrow" onClick={() => state[label] = !state[label]}>
			<div className={css('svCheckbox', state[label] && 'svChecked')} tabIndex={0}
				role="checkbox" aria-checked="false" aria-label="" title="">
				<Icon name="check" />
			</div>
			{label}
		</div>
	}
}

export class Icon extends PureComponent<{ name: string, title?: string } & React.HTMLAttributes<HTMLDivElement>> {
	render() {
		const {name, ...divProps} = this.props
		return <div className={`codicon codicon-${name}`} {...divProps}></div>
	}
}

// Adapated from sarif-web-component.
export class Hi extends React.Component<React.HTMLAttributes<HTMLDivElement>> {
	static contextType = FilterKeywordContext
	render() {
		let term = this.context
		function hi(children: React.ReactNode) {
			if (!term || term.length <= 1) return children
			if (children === undefined)
				return null
			if (Array.isArray(children))
				return React.Children.map(children, hi)
			if (React.isValidElement(children))
				return React.cloneElement(children, undefined, hi(children.props.children))
			if (!['number', 'string'].includes(typeof children))
				return children
			term = term.replace(/[\-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g, '\\$&').replace(/\*/g, '.*')
			return (children + '')
				.split(new RegExp(`(${term.split(/\s+/).filter(part => part).join('|')})`, 'i'))
				.map((word, i) => i % 2 === 1 ? <mark key={i}>{word}</mark> : word)
		}

		const {children, ...divProps} = this.props
		return <div {...divProps}>{hi(children)}</div>
	}
}

export interface ListProps<T> {
	className?: string
	horiztonal?: boolean
	items?: ReadonlyArray<T>
	renderItem: (item: T, i: number) => React.ReactNode
	selection?: IObservableValue<T>
}
@observer export class List<T> extends PureComponent<ListProps<T>> {
	private selection = this.props.selection ?? observable.box(this.props.items[0])
	render() {
		const {className, items, renderItem, children} = this.props
		return !items?.length
			? <div className={css('svList', 'svListZero', className)}>{children}</div>
			: <div tabIndex={0} className={css('svList', className)} onKeyDown={this.onKeyDown}>
				{(items || []).map((item, i) => {
					return <div key={i}
						className={css('svListItem', item === this.selection.get() && 'svItemSelected')}
						onClick={() => this.selection.set(item)}>
						{renderItem(item, i)}
					</div>
				})}
			</div>
	}
	@action.bound private onKeyDown(e: React.KeyboardEvent<Element>) {
		e.stopPropagation()
		const {items, selection} = this.props
		const index = items.indexOf(selection.get())
		const prev = () => selection.set(items[index - 1] ?? items[index])
		const next = () => selection.set(items[index + 1] ?? items[index])
		const handlers = this.props.horiztonal
			? { ArrowLeft: prev, ArrowRight: next }
			: { ArrowUp: prev, ArrowDown: next }
		handlers[e.key]?.()
	}
}

@observer export class Popover extends PureComponent<{ show: IObservableValue<boolean> } & React.HTMLAttributes<HTMLDivElement>> {
	render() {
		const {children, show, className, ...divProps} = this.props
		if (!show.get()) return null
		return <div className={css('svPopover', className)} onMouseDown={e => e.stopPropagation()} {...divProps} >
			{children}
		</div>
	}
	@action.bound private onKeyDown(e: KeyboardEvent) {
		const {show} = this.props
		if (show.get() && e.key === 'Escape') {
			show.set(false)
			e.stopImmediatePropagation()
		}
	}
	@action.bound private onClick() {
		this.props.show.set(false)
	}
	componentDidMount() {
		addEventListener('keydown', this.onKeyDown, true)
		addEventListener('mousedown', this.onClick)
	}
	componentWillUnmount() {
		removeEventListener('keydown', this.onKeyDown)
		removeEventListener('mousedown', this.onClick)
	}
}

@observer export class TabBar extends Component<{ titles: string[], selection: IObservableValue<string> }> {
	render() {
		const {titles, selection} = this.props
		const renderItem = title => <div>{title}</div>
		return <List className="svTabs" horiztonal items={titles} renderItem={renderItem} selection={selection} />
	}
}

@observer export class TabPanel extends Component<{ titles: string[] }> {
	private selection = observable.box(this.props.titles[0])
	render() {
		const {selection} = this
		const {children, titles} = this.props
		const array = React.Children.toArray(children)
		return <>
			<TabBar titles={titles} selection={selection} />
			{array[titles.indexOf(selection.get())]}
		</>
	}
}

export class ResizeHandle extends Component<{ size: IObservableValue<number>, horizontal?: boolean }> {
	private startingMouse = Number.NaN
	private startingSize = Number.NaN

	@action.bound private onMouseDown(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
		const {horizontal} = this.props
		this.startingMouse = horizontal ? e.nativeEvent.x : e.nativeEvent.y
		this.startingSize = this.props.size.get()
		document.addEventListener('mousemove', this.onMouseMove)
		document.addEventListener('mouseup', this.onMouseUp)
	}

	@action.bound private onMouseMove(e: MouseEvent) {
		// Assert !isNaN(this.dragMouse))
		const {horizontal} = this.props
		const delta = this.startingMouse - (horizontal ? e.x : e.y)
		this.props.size.set(Math.max(0, this.startingSize + delta * (horizontal ? -1 : 1)))
		e.preventDefault() // Prevent text selection.
	}

	@action.bound private onMouseUp(_e: MouseEvent) {
		this.startingMouse = Number.NaN
		this.startingSize = Number.NaN
		document.removeEventListener('mousemove', this.onMouseMove)
		document.removeEventListener('mouseup', this.onMouseUp)
	}

	render() {
		const {horizontal} = this.props
		const style: CSSProperties = horizontal
			? {
				position: 'absolute', zIndex: 1,
				cursor: 'col-resize',
				right: -10, width: 20,
				top: 0, bottom: 0
			}
			: {
				position: 'absolute', zIndex: 1,
				cursor: 'row-resize',
				bottom: -10, height: 20,
				left: 0, right: 0
			}

		return <div onMouseDown={this.onMouseDown} style={style}></div>
	}
}

// Not a widget, but just an orphan helper.
// Borrowed from: sarif-web-component.
// 3.11.6 Messages with embedded links. Replace [text](relatedIndex) with <a href />.
// 3.10.3 sarif URI scheme is not supported.
export function renderMessageWithEmbeddedLinks(result: Result, postMessage: (_: any) => {}) {
	const message = result._message
	const rxLink = /\[([^\]]*)\]\(([^\)]+)\)/ // Matches [text](id). Similar to below, but with an extra grouping around the id part.
	return message.match(rxLink)
		? message
			.split(/(\[[^\]]*\]\([^\)]+\))/g)
			.map((item, i) => {
				if (i % 2 === 0) return item
				const [_, text, id] = item.match(rxLink)
				return isNaN(+id)
					? <a key={i} tabIndex={-1} href={id}>{text}</a>
					: <a key={i} tabIndex={-1} href="#" onClick={e => {
						e.preventDefault() // Don't leave a # in the url.
						e.stopPropagation()
						postMessage({ command: 'select', id: result._id, relatedLocationId: +id })
					}}>{text}</a>
			})
		: message
}
