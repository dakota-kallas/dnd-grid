type Position = {
    /** horizontal position starting with 1 */
    x: number;
    /** vertical position starting with 1 */
    y: number;
    /** box width */
    w: number;
    /** box height */
    h: number;
};
export type GridPosition = Position;
export type PixelPosition = Position;
export type SizeLimits = {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
};
export type LayoutElement = {
    /** Box identifier (can be any type) */
    id: any;
    /** is box hidden? */
    hidden?: boolean;
    /** should box stay fixed on its position */
    pinned?: boolean;
    /** box can be resized */
    isResizable?: boolean;
    /** box can be dragged */
    isDraggable?: boolean;
    /** box position in the layout grid */
    position: GridPosition;
    /** min/max width/height the box can be resized to */
    resizeLimits?: SizeLimits;
};
export type LayoutOptions = {
    bubbleUp?: boolean | "jump-over";
};
export type Layout = readonly LayoutElement[];
export declare function sort(layout: Layout): LayoutElement[];
export declare function isFree(layout: readonly LayoutElement[], position: GridPosition, filter?: (_layout: LayoutElement) => boolean): boolean;
export declare function getSize(layout: readonly LayoutElement[]): {
    w: number;
    h: number;
};
export declare function moveToFreePlace(layout: readonly LayoutElement[], box: LayoutElement, layoutOptions?: LayoutOptions): LayoutElement;
export declare function updateBoxData(box: LayoutElement, data?: Partial<LayoutElement>): {
    position: {
        /** horizontal position starting with 1 */
        x: number;
        /** vertical position starting with 1 */
        y: number;
        /** box width */
        w: number;
        /** box height */
        h: number;
    };
    hidden?: boolean;
    pinned?: boolean;
    isResizable?: boolean;
    isDraggable?: boolean;
    resizeLimits?: SizeLimits;
    /** Box identifier (can be any type) */
    id: any;
};
export declare function fix(layout: Layout, layoutOptions?: LayoutOptions): LayoutElement[];
export declare function getBox(layout: Layout, id: any): LayoutElement;
export declare function createBox(layout: Layout, id: any, data: Partial<LayoutElement>, layoutOptions: LayoutOptions): LayoutElement;
export declare function addBox(layout: Layout, box: LayoutElement, layoutOptions: LayoutOptions): Layout;
export declare function updateBox(layout: Layout, id: any, data: Partial<LayoutElement>, layoutOptions: LayoutOptions): Layout;
export declare function removeBox(layout: Layout, id: any, layoutOptions: LayoutOptions): Layout;
export declare function isOverlapping(positionA: GridPosition, positionB: GridPosition): boolean;
export declare function toPixels(position: GridPosition, cellWidth: number, cellHeight: number, spacing?: number): PixelPosition;
export declare function fromPixels(pixels: PixelPosition, cellWidth: number, cellHeight: number, spacing?: number): GridPosition;
export declare function clamp(value: number, min: number, max: number): number;
export {};
