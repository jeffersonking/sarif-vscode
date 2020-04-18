import { action, IObservableValue } from 'mobx'
import * as React from 'react'
import { Component, CSSProperties } from 'react'

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
