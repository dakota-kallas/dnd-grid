import { GridPosition } from '../tools/layout';
declare const _default: __VLS_WithTemplateSlots<import('vue').DefineComponent<import('vue').ExtractPropTypes<{
    boxId: {
        required: true;
        type: any;
    };
    overflow: {
        type: StringConstructor;
        default: string;
    };
}>, {}, {}, {}, {}, import('vue').ComponentOptionsMixin, import('vue').ComponentOptionsMixin, {}, string, import('vue').PublicProps, Readonly<import('vue').ExtractPropTypes<{
    boxId: {
        required: true;
        type: any;
    };
    overflow: {
        type: StringConstructor;
        default: string;
    };
}>> & Readonly<{}>, {
    overflow: string;
}, {}, {}, {}, string, import('vue').ComponentProvideOptions, true, {}, any>, {
    placeholder?(_: {
        id: any;
        hidden?: boolean;
        pinned?: boolean;
        isResizable?: boolean;
        isDraggable?: boolean;
        position: GridPosition;
        resizeLimits?: import('../tools/layout').SizeLimits;
    }): any;
    default?(_: {
        id: any;
        hidden?: boolean;
        pinned?: boolean;
        isResizable?: boolean;
        isDraggable?: boolean;
        position: GridPosition;
        resizeLimits?: import('../tools/layout').SizeLimits;
    }): any;
}>;
export default _default;
type __VLS_WithTemplateSlots<T, S> = T & {
    new (): {
        $slots: S;
    };
};
