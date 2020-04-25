import { action, IObservableValue, observable } from 'mobx'
import { observer } from 'mobx-react'
import * as React from 'react'
import { Component, CSSProperties, PureComponent } from 'react'
import { Result } from 'sarif'
import './Index.widgets.scss'

export class Badge extends PureComponent<{ text: { toString: () => string } }> {
	render() {
		return <span className="svBadge">{this.props.text.toString()}</span>
	}
}

@observer export class Checkrow extends PureComponent<{ label: string, state: Record<string, boolean>}> {
	render() {
		const {label, state} = this.props
		return <div className="svCheckrow" onClick={() => state[label] = !state[label]}>
			<div className={`svCheckbox ${state[label] ? 'svChecked' : '' }`} tabIndex={0}
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

@observer export class Popover extends PureComponent<{ show: IObservableValue<boolean> } & React.HTMLAttributes<HTMLDivElement>> {
	render() {
		const {children, show, className, ...divProps} = this.props
		if (!show.get()) return null
		return <div className={`svPopover ${className ?? ''}`} onMouseDown={e => e.stopPropagation()} {...divProps} >
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
		return <div className="svTabs">
			{titles.map((title, i) => <div key={i} onClick={() => selection.set(title)}>
				<div className={selection.get() === title ? 'svTabSelected' : ''}>{title}</div>
			</div>)}
		</div>
	}
}

@observer export class TabPanel extends Component<{ titles: string[] }> {
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
export function renderMessageWithEmbeddedLinks(result: Result, postMessage: (_: any) => {}) {
	const message = result.message.text ?? ''
	const rxLink = /\[([^\]]*)\]\(([^\)]+)\)/ // Matches [text](id). Similar to below, but with an extra grouping around the id part.
	return message.match(rxLink)
		? message
			.split(/(\[[^\]]*\]\([^\)]+\))/g)
			.map((item, i) => {
				if (i % 2 === 0) return item
				const [_, text, id] = item.match(rxLink)
				if (isNaN(+id)) return <a key={i} href={id}>{text}</a>
				const onClick = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
					e.preventDefault() // Don't leave a # in the url.
					e.stopPropagation()
					postMessage({ command: 'select', id: result._id, relatedLocationId: +id })
				}
				return <a key={i} href="#" onClick={onClick}>{text}</a>
			})
		: message
}
