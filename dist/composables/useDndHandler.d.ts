type MouseCallbackArg = {
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
};
export type EventHandlerCallback = (movement: MouseCallbackArg, evt: MouseEvent | TouchEvent | undefined) => void;
export type Callbacks = {
    allow?: (evt: MouseEvent | TouchEvent) => boolean;
    start?: (movement: MouseCallbackArg, evt: MouseEvent | TouchEvent) => void;
    stop?: (movement: MouseCallbackArg, evt: MouseEvent | TouchEvent | undefined) => void;
    update?: (movement: MouseCallbackArg, evt: MouseEvent | TouchEvent) => void;
};
export default function useMouseHandler(callbacks?: Callbacks): {
    touchstart: (evt: MouseEvent | TouchEvent) => void;
    mousedown: (evt: MouseEvent | TouchEvent) => void;
};
export {};
