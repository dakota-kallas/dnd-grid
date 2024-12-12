import { Prop } from 'vue';
import { Layout } from '../tools/layout';
declare const _default: __VLS_WithTemplateSlots<import('vue').DefineComponent<import('vue').ExtractPropTypes<{
    layout: Prop<Layout>;
    bubbleUp: Prop<boolean | "jump-over">;
    disabled: {
        type: BooleanConstructor;
        default: boolean;
    };
    isResizable: {
        type: BooleanConstructor;
        default: boolean;
    };
    isDraggable: {
        type: BooleanConstructor;
        default: boolean;
    };
    dragSelector: Prop<{
        include: string;
        exclude?: string | undefined;
    }>;
    resizeSelector: Prop<{
        include: string;
        exclude?: string | undefined;
    }>;
    addResizeHandles: {
        type: BooleanConstructor;
        default: boolean;
    };
    cellWidth: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellMaxWidth: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellHeight: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellMaxHeight: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellSpacing: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    resizeHandlerSize: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    resizeHandlerOffset: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    placeholderBackground: {
        type: StringConstructor;
        default: any;
    };
    placeholderBorder: {
        type: StringConstructor;
        default: any;
    };
    transitionTimingFunction: {
        type: StringConstructor;
        default: any;
    };
    transitionDuration: {
        type: StringConstructor;
        default: any;
    };
}>, {}, {}, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {
    "update:layout": (...args: any[]) => void;
}, string, import('vue').PublicProps, Readonly<import('vue').ExtractPropTypes<{
    layout: Prop<Layout>;
    bubbleUp: Prop<boolean | "jump-over">;
    disabled: {
        type: BooleanConstructor;
        default: boolean;
    };
    isResizable: {
        type: BooleanConstructor;
        default: boolean;
    };
    isDraggable: {
        type: BooleanConstructor;
        default: boolean;
    };
    dragSelector: Prop<{
        include: string;
        exclude?: string | undefined;
    }>;
    resizeSelector: Prop<{
        include: string;
        exclude?: string | undefined;
    }>;
    addResizeHandles: {
        type: BooleanConstructor;
        default: boolean;
    };
    cellWidth: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellMaxWidth: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellHeight: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellMaxHeight: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    cellSpacing: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    resizeHandlerSize: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    resizeHandlerOffset: {
        type: (StringConstructor | NumberConstructor)[];
        default: any;
    };
    placeholderBackground: {
        type: StringConstructor;
        default: any;
    };
    placeholderBorder: {
        type: StringConstructor;
        default: any;
    };
    transitionTimingFunction: {
        type: StringConstructor;
        default: any;
    };
    transitionDuration: {
        type: StringConstructor;
        default: any;
    };
}>> & Readonly<{
    "onUpdate:layout"?: (...args: any[]) => any;
}>, {
    isResizable: boolean;
    isDraggable: boolean;
    disabled: boolean;
    addResizeHandles: boolean;
    cellWidth: string | number;
    cellMaxWidth: string | number;
    cellHeight: string | number;
    cellMaxHeight: string | number;
    cellSpacing: string | number;
    resizeHandlerSize: string | number;
    resizeHandlerOffset: string | number;
    placeholderBackground: string;
    placeholderBorder: string;
    transitionTimingFunction: string;
    transitionDuration: string;
}, {}, {}, {}, string, import('vue').ComponentProvideOptions, true, {}, any>, {
    default?(_: {}): any;
}>;
export default _default;
type __VLS_WithTemplateSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
