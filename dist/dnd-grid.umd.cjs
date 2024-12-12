(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('vue')) :
    typeof define === 'function' && define.amd ? define(['exports', 'vue'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.DndGrid = {}, global.Vue));
})(this, (function (exports, vue) { 'use strict';

    const ContainerSymbol = Symbol("DndGridContainer");

    function sort(layout) {
      return [...layout].sort((a, b) => {
        if (a.hidden && !b.hidden) {
          return 1;
        }
        if (!a.hidden && b.hidden) {
          return -1;
        }
        if (a.position.y < b.position.y) {
          return -1;
        }
        if (a.position.y > b.position.y) {
          return 1;
        }
        if (a.position.x < b.position.x) {
          return -1;
        }
        if (a.position.x > b.position.x) {
          return 1;
        }
        return 0;
      });
    }
    function isFree(layout, position, filter = (_layout) => true) {
      for (let i = 0; i < layout.length; i++) {
        if (!filter(layout[i])) continue;
        if (isOverlapping(layout[i].position, position)) {
          return false;
        }
      }
      return true;
    }
    function getSize(layout) {
      let w = 0;
      let h = 0;
      for (let i = 0; i < layout.length; i++) {
        const box = layout[i];
        if (box.hidden) continue;
        w = Math.max(w, box.position.x + box.position.w);
        h = Math.max(h, box.position.y + box.position.h);
      }
      return { w, h };
    }
    function moveToFreePlace(layout, box, layoutOptions) {
      if (box.pinned) {
        return box;
      }
      const newPosition = { ...box.position };
      const initialY = newPosition.y;
      if (layoutOptions?.bubbleUp && newPosition.y > 0) {
        if (layoutOptions?.bubbleUp === "jump-over") {
          newPosition.y = 0;
        }
        do {
          newPosition.y--;
        } while (newPosition.y >= 0 && isFree(layout, newPosition, (_box) => _box.id !== box.id));
        newPosition.y++;
      }
      while (!isFree(layout, newPosition, (_box) => _box.id !== box.id)) {
        newPosition.y++;
      }
      if (newPosition.y === initialY) {
        return box;
      }
      return updateBoxData(box, { position: newPosition });
    }
    function updateBoxData(box, data = {}) {
      const { id, position, ...layoutOptions } = data;
      return {
        ...box,
        ...layoutOptions,
        position: {
          ...box.position,
          ...position
        }
      };
    }
    function fix(layout, layoutOptions) {
      let newLayout = sort(layout);
      if (layoutOptions?.bubbleUp) {
        newLayout.forEach((box, index) => {
          newLayout[index] = moveToFreePlace(newLayout, box, layoutOptions);
        });
        newLayout = sort(newLayout);
      }
      return newLayout;
    }
    function getBox(layout, id) {
      return _getBox(layout, id).box;
    }
    function createBox(layout, id, data, layoutOptions) {
      let box = { id, position: { x: 0, y: 0, w: 1, h: 1 } };
      if (data) {
        box = updateBoxData(box, data);
      }
      return moveToFreePlace(layout, box, layoutOptions);
    }
    function placeBox(layout, box, layoutOptions) {
      let newLayout = layout.filter((_box) => _box.id !== box.id && _box.pinned);
      box = moveToFreePlace(newLayout, box);
      newLayout.push(box);
      sort(layout).forEach((_box) => {
        if (_box.id === box.id || _box.pinned) return;
        newLayout.push(moveToFreePlace(newLayout, _box));
      });
      return fix(newLayout, layoutOptions);
    }
    function addBox(layout, box, layoutOptions) {
      const { index, box: _box } = _getBox(layout, box.id);
      if (box === _box || index > -1) {
        return layout;
      }
      return placeBox(layout, box, layoutOptions);
    }
    function updateBox(layout, id, data, layoutOptions) {
      const { box } = _getBox(layout, id);
      if (!box) {
        return layout;
      }
      return placeBox(layout, updateBoxData(box, data), layoutOptions);
    }
    function removeBox(layout, id, layoutOptions) {
      const index = _getBox(layout, id).index;
      if (index > -1) {
        const newLayout = [...layout];
        newLayout.splice(index, 1);
        return fix(newLayout, layoutOptions);
      }
      return layout;
    }
    function isOverlapping(positionA, positionB) {
      return positionA.x < positionB.x + positionB.w && positionA.x + positionA.w > positionB.x && positionA.y < positionB.y + positionB.h && positionA.y + positionA.h > positionB.y;
    }
    function toPixels(position, cellWidth, cellHeight, spacing = 0) {
      const pixels = {};
      for (let key in position || {}) {
        switch (key) {
          case "x":
            pixels[key] = position.x * (cellWidth + spacing);
            break;
          case "y":
            pixels[key] = position.y * (cellHeight + spacing);
            break;
          case "w":
            pixels[key] = position.w * (cellWidth + spacing) - spacing;
            break;
          case "h":
            pixels[key] = position.h * (cellHeight + spacing) - spacing;
            break;
        }
      }
      return pixels;
    }
    function fromPixels(pixels, cellWidth, cellHeight, spacing = 0) {
      const position = {};
      for (let key in pixels || {}) {
        switch (key) {
          case "x":
            position[key] = Math.floor(pixels.x / (cellWidth + spacing));
            break;
          case "y":
            position[key] = Math.floor(pixels.y / (cellHeight + spacing));
            break;
          case "w":
            position[key] = Math.floor((pixels.w + spacing) / (cellWidth + spacing));
            break;
          case "h":
            position[key] = Math.floor((pixels.h + spacing) / (cellHeight + spacing));
            break;
        }
      }
      return position;
    }
    function _getBox(layout, id) {
      const index = layout.findIndex((box) => box.id === id);
      return {
        index,
        box: index > -1 ? layout[index] : void 0
      };
    }
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function useMouseHandler(callbacks = {}) {
      let hasStarted = false;
      let isActive = false;
      let isTouch = false;
      let startEvent;
      let startX;
      let startY;
      let offsetX;
      let offsetY;
      function doUpdate(type, evt) {
        if (evt) {
          offsetX = (isTouch ? evt.changedTouches[0].pageX : evt.pageX) - startX;
          offsetY = (isTouch ? evt.changedTouches[0].pageY : evt.pageY) - startY;
        }
        callbacks[type]?.({ startX, startY, offsetX, offsetY }, evt);
      }
      function onStart(evt) {
        if (evt.defaultPrevented || hasStarted || !callbacks?.["allow"]?.(evt)) return;
        evt.stopPropagation();
        evt.preventDefault();
        hasStarted = true;
        isTouch = evt.type === "touchstart";
        startEvent = evt;
        startX = isTouch ? evt.changedTouches[0].pageX : evt.pageX;
        startY = isTouch ? evt.changedTouches[0].pageY : evt.pageY;
        if (isTouch) {
          window.addEventListener("touchcancel", onCancel, { once: true });
          window.addEventListener("touchend", onStop, { once: true });
          window.addEventListener("touchmove", onMove, { passive: false });
        } else {
          window.addEventListener("mouseup", onStop, { once: true });
          window.addEventListener("mousemove", onMove, { passive: false });
        }
      }
      function onStop(evt) {
        evt?.stopPropagation();
        evt?.preventDefault();
        if (isTouch) {
          window.removeEventListener("touchcancel", onCancel, { once: true });
          window.removeEventListener("touchend", onStop, { once: true });
          window.removeEventListener("touchmove", onMove, { passive: false });
        } else {
          window.removeEventListener("mouseup", onStop, { once: true });
          window.removeEventListener("mousemove", onMove, { passive: false });
        }
        if (isActive) {
          doUpdate("stop", evt);
        }
        hasStarted = false;
        isActive = false;
        startEvent = void 0;
      }
      function onCancel(evt) {
        evt?.stopPropagation();
        evt?.preventDefault();
        return onStop(startEvent);
      }
      function onMove(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        if (!isActive) {
          isActive = true;
          doUpdate("start", startEvent);
        }
        doUpdate("update", evt);
      }
      vue.onScopeDispose(() => onCancel());
      return {
        touchstart: onStart,
        mousedown: onStart
      };
    }

    const _hoisted_1$1 = {
      key: 0,
      class: "dndgrid__box_placeholderContainer"
    };
    const _hoisted_2 = {
      key: 1,
      class: "dndgrid__box_resizeHandleContainer"
    };
    const __default__$1 = {
      inheritAttrs: false
    };
    const _sfc_main$1 = /* @__PURE__ */ vue.defineComponent({
      ...__default__$1,
      __name: "Box",
      props: {
        boxId: {
          required: true,
          type: null
        },
        overflow: {
          type: String,
          default: "hidden"
        }
      },
      setup(__props) {
        const props = __props;
        const {
          computedCellSize: computedCellSizeRef,
          disabled: disabledRef,
          isResizable: isResizableRef,
          isDraggable: isDraggableRef,
          addResizeHandles: addResizeHandlesRef,
          canStartDrag,
          canStartResize,
          getBox,
          updateBox,
          startLayout,
          stopLayout
        } = vue.inject(ContainerSymbol);
        const overlayEl = document.createElement("div");
        overlayEl.classList.add("dndgrid__box_overlay");
        const slotContainerElRef = vue.shallowRef();
        const boxElRef = vue.shallowRef();
        const boxRef = vue.computed(() => getBox(props.boxId));
        const visibleRef = vue.computed(() => boxRef.value && !(boxRef.value.hidden ?? false));
        const positionRef = vue.computed(() => boxRef.value?.position);
        const cssPositionRef = vue.computed(() => {
          const position = positionRef.value;
          const pixels = cssPixelsRef.value;
          const basePixels = baseCssPixelsRef.value;
          return {
            "--dnd-grid-box-x": (position?.x ?? 0) + 1,
            "--dnd-grid-box-y": (position?.y ?? 0) + 1,
            "--dnd-grid-box-width": position?.w ?? 0,
            "--dnd-grid-box-height": position?.h ?? 0,
            "--dndgrid__box_box_cssPixels-x": pixels?.x ?? 0,
            "--dndgrid__box_box_cssPixels-y": pixels?.y ?? 0,
            "--dndgrid__box_box_cssPixels-w": pixels?.w ?? 0,
            "--dndgrid__box_box_cssPixels-h": pixels?.h ?? 0,
            "--dndgrid__box_box_baseCssPixels-x": basePixels?.x ?? 0,
            "--dndgrid__box_box_baseCssPixels-y": basePixels?.y ?? 0,
            "--dndgrid__box_box_baseCssPixels-w": basePixels?.w ?? 0,
            "--dndgrid__box_box_baseCssPixels-h": basePixels?.h ?? 0
          };
        });
        const pixelsRef = vue.computed(() => {
          if (!positionRef.value || !computedCellSizeRef.value) return;
          const { width, height, spacing } = computedCellSizeRef.value;
          return toPixels(
            boxRef.value.position,
            width,
            height,
            spacing
          );
        });
        const cssPixelsRef = vue.computed(() => {
          const pixels = pixelsRef.value;
          return {
            x: `${pixels?.x ?? 0}px`,
            y: `${pixels?.y ?? 0}px`,
            w: `${pixels?.w ?? 0}px`,
            h: `${pixels?.h ?? 0}px`
          };
        });
        const isBoxResizableRef = vue.computed(() => {
          return (!disabledRef.value && isResizableRef.value && (boxRef.value?.isResizable ?? true) && (!boxRef.value?.pinned || boxRef.value?.isResizable)) ?? false;
        });
        const isBoxDraggableRef = vue.computed(() => {
          return (!disabledRef.value && isDraggableRef.value && (boxRef.value?.isDraggable ?? true) && (!boxRef.value?.pinned || boxRef.value?.isDraggable)) ?? false;
        });
        const baseCssPixelsRef = vue.shallowRef({});
        let basePosition;
        const isDraggingRef = vue.shallowRef(false);
        const dragEvents = useMouseHandler({
          allow: function allowDrag(evt) {
            return isBoxDraggableRef.value && canStartDrag(evt);
          },
          start: function onDragStart() {
            startLayout();
            baseCssPixelsRef.value = cssPixelsRef.value;
            basePosition = positionRef.value;
            isDraggingRef.value = true;
            document.body.appendChild(overlayEl);
            document.body.setAttribute("dnd-grid-drag", "");
          },
          stop: function onDragStop() {
            stopLayout();
            isDraggingRef.value = false;
            slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-left");
            slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-top");
            overlayEl.remove();
            document.body.removeAttribute("dnd-grid-drag");
          },
          update: function onDragUpdate({ offsetX, offsetY }) {
            let offsetPixels = { x: offsetX, y: offsetY, w: 0, h: 0 };
            applyOffsetPixels(basePosition, offsetPixels);
          }
        });
        const isResizingRef = vue.shallowRef(false);
        let resizeMode;
        const resizeEvents = useMouseHandler({
          allow: function allowResize(evt) {
            return isBoxResizableRef.value && canStartResize(evt);
          },
          start: function onResizeStart(_, evt) {
            startLayout();
            resizeMode = evt?.target?.getAttribute?.("dnd-grid-resize") || "br";
            baseCssPixelsRef.value = cssPixelsRef.value;
            basePosition = positionRef.value;
            isResizingRef.value = true;
            document.body.appendChild(overlayEl);
            document.body.setAttribute("dnd-grid-resize", resizeMode);
          },
          stop: function onResizeStop() {
            stopLayout();
            isResizingRef.value = false;
            slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-width");
            slotContainerElRef.value?.style?.removeProperty("--dnd-grid-box-offset-height");
            overlayEl.remove();
            document.body.removeAttribute("dnd-grid-resize");
          },
          update: function onResizeUpdate({ offsetX, offsetY }) {
            let offsetPixels = { x: 0, y: 0, w: 0, h: 0 };
            switch (resizeMode?.[0]) {
              case "t":
                offsetPixels.y = offsetY;
                offsetPixels.h = -offsetY;
                break;
              case "b":
                offsetPixels.h = offsetY;
                break;
            }
            switch (resizeMode?.[1]) {
              case "l":
                offsetPixels.x = offsetX;
                offsetPixels.w = -offsetX;
                break;
              case "r":
                offsetPixels.w = offsetX;
                break;
            }
            applyOffsetPixels(basePosition, offsetPixels);
          }
        });
        const boxEventsRef = vue.computed(() => {
          return mergeEvents(dragEvents, resizeEvents);
        });
        function applyOffsetPixels(basePosition2, offsetPixels) {
          const slotContainerEl = slotContainerElRef.value;
          const cellSize = computedCellSizeRef.value;
          const { width, height, spacing } = computedCellSizeRef.value;
          const {
            minWidth = 1,
            minHeight = 1,
            maxWidth = Infinity,
            maxHeight = Infinity
          } = boxRef.value.resizeLimits ?? {};
          const minPixelWidth = minWidth * (cellSize.width + spacing) - spacing;
          const maxPixelWidth = maxWidth * (cellSize.width + spacing) - spacing;
          const minPixelHeight = minHeight * (cellSize.height + spacing) - spacing;
          const maxPixelHeight = maxHeight * (cellSize.height + spacing) - spacing;
          slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-left", `${offsetPixels.x}px`);
          slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-top", `${offsetPixels.y}px`);
          slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-width", `${clamp(offsetPixels.w, minPixelWidth, maxPixelWidth)}px`);
          slotContainerEl?.style?.setProperty("--dnd-grid-box-offset-height", `${clamp(offsetPixels.h, minPixelHeight, maxPixelHeight)}px`);
          slotContainerEl?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest"
          });
          const halfCellSizeWidth = cellSize.width / 2;
          const halfCellSizeHeight = cellSize.height / 2;
          const targetPosition = fromPixels({
            x: offsetPixels.x + halfCellSizeWidth,
            // add half cellsize for better box placement
            y: offsetPixels.y + halfCellSizeHeight,
            w: offsetPixels.w + halfCellSizeWidth,
            h: offsetPixels.h + halfCellSizeHeight
          }, cellSize.width, cellSize.height, cellSize.spacing);
          targetPosition.x = Math.max(0, targetPosition.x + basePosition2.x);
          targetPosition.y = Math.max(0, targetPosition.y + basePosition2.y);
          targetPosition.w = clamp(targetPosition.w + basePosition2.w, minWidth, maxWidth);
          targetPosition.h = clamp(targetPosition.h + basePosition2.h, minHeight, maxHeight);
          updatePosition(targetPosition);
        }
        function updatePosition(targetPosition) {
          const position = positionRef.value;
          if (position.x !== targetPosition.x || position.y !== targetPosition.y || position.w !== targetPosition.w || position.h !== targetPosition.h) {
            updateBox(boxRef.value.id, { position: targetPosition });
          }
        }
        function mergeEvents(...eventObjects) {
          const eventMap = /* @__PURE__ */ new Map();
          eventObjects.forEach((eventObject) => {
            for (const key in eventObject) {
              const callbackList = eventMap.get(key) || eventMap.set(key, []).get(key);
              callbackList.push(eventObject[key]);
            }
          });
          const mergedEvents = {};
          eventMap.forEach((callbacks, key) => {
            mergedEvents[key] = (evt) => callbacks.forEach((callback) => callback(evt));
          });
          return mergedEvents;
        }
        vue.onScopeDispose(() => {
          overlayEl.remove();
        });
        return (_ctx, _cache) => {
          return visibleRef.value ? (vue.openBlock(), vue.createElementBlock("div", vue.mergeProps({
            key: 0,
            ref_key: "boxElRef",
            ref: boxElRef,
            class: {
              dndgrid__box_box: true,
              dndgrid__box_dragging: isDraggingRef.value,
              dndgrid__box_resizing: isResizingRef.value
            },
            style: cssPositionRef.value
          }, vue.toHandlers(boxEventsRef.value, true)), [
            isDraggingRef.value || isResizingRef.value ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_1$1, [
              vue.renderSlot(_ctx.$slots, "placeholder", vue.normalizeProps(vue.guardReactiveProps(boxRef.value)), () => [
                _cache[0] || (_cache[0] = vue.createElementVNode("div", { class: "dndgrid__box_placeholder" }, null, -1))
              ])
            ])) : vue.createCommentVNode("", true),
            vue.createElementVNode("div", {
              ref_key: "slotContainerElRef",
              ref: slotContainerElRef,
              class: "dndgrid__box_slotContainer",
              style: vue.normalizeStyle({
                "--dndgrid__box_overflow": props.overflow
              })
            }, [
              vue.renderSlot(_ctx.$slots, "default", vue.normalizeProps(vue.guardReactiveProps(boxRef.value)))
            ], 4),
            vue.unref(addResizeHandlesRef) && isBoxResizableRef.value ? (vue.openBlock(), vue.createElementBlock("div", _hoisted_2, _cache[1] || (_cache[1] = [
              vue.createElementVNode("div", { "dnd-grid-resize": "t-" }, null, -1),
              vue.createElementVNode("div", { "dnd-grid-resize": "-r" }, null, -1),
              vue.createElementVNode("div", { "dnd-grid-resize": "b-" }, null, -1),
              vue.createElementVNode("div", { "dnd-grid-resize": "-l" }, null, -1),
              vue.createElementVNode("div", { "dnd-grid-resize": "tl" }, null, -1),
              vue.createElementVNode("div", { "dnd-grid-resize": "tr" }, null, -1),
              vue.createElementVNode("div", { "dnd-grid-resize": "br" }, null, -1),
              vue.createElementVNode("div", { "dnd-grid-resize": "bl" }, null, -1)
            ]))) : vue.createCommentVNode("", true)
          ], 16)) : vue.createCommentVNode("", true);
        };
      }
    });

    const _hoisted_1 = ["dnd-grid-mode"];
    const __default__ = {
      inheritAttrs: true
    };
    let NEXT_DND_GRID_ID = 1;
    const _sfc_main = /* @__PURE__ */ vue.defineComponent({
      ...__default__,
      __name: "Container",
      props: {
        layout: {
          type: Array,
          default: () => []
        },
        bubbleUp: {
          type: [Boolean, String],
          default: false
        },
        disabled: {
          type: Boolean,
          default: false
        },
        isResizable: {
          type: Boolean,
          default: true
        },
        isDraggable: {
          type: Boolean,
          default: true
        },
        dragSelector: {
          type: Object,
          default: () => ({
            include: "[dnd-grid-drag]",
            exclude: ":is(input, button, select, a[href])"
          })
        },
        resizeSelector: {
          type: Object,
          default: () => ({
            include: "[dnd-grid-resize]",
            exclude: ":is(input, button, select, a[href])"
          })
        },
        addResizeHandles: {
          type: Boolean,
          default: true
        },
        // styling (mapped to css props)
        cellWidth: {
          type: [Number, String],
          default: null
        },
        cellMaxWidth: {
          type: [Number, String],
          default: null
        },
        cellHeight: {
          type: [Number, String],
          default: null
        },
        cellMaxHeight: {
          type: [Number, String],
          default: null
        },
        cellSpacing: {
          type: [Number, String],
          default: null
        },
        resizeHandlerSize: {
          type: [Number, String],
          default: null
        },
        resizeHandlerOffset: {
          type: [Number, String],
          default: null
        },
        placeholderBackground: {
          type: String,
          default: null
        },
        placeholderBorder: {
          type: String,
          default: null
        },
        transitionTimingFunction: {
          type: String,
          default: null
        },
        transitionDuration: {
          type: String,
          default: null
        }
      },
      emits: ["update:layout"],
      setup(__props, { emit: __emit }) {
        const props = __props;
        const DND_GRID_ID = NEXT_DND_GRID_ID++;
        const emit = __emit;
        const containerElRef = vue.shallowRef();
        const computedCellSizeRef = vue.shallowRef();
        const modeRef = vue.shallowRef("grid");
        const layoutRef = vue.shallowRef(props.layout);
        const isResizable = vue.computed(() => props.isResizable);
        const isDraggable = vue.computed(() => props.isResizable);
        const addResizeHandles = vue.computed(() => props.addResizeHandles);
        const disabled = vue.computed(() => props.disabled);
        vue.provide(ContainerSymbol, {
          layout: vue.readonly(layoutRef),
          mode: vue.readonly(modeRef),
          disabled,
          isResizable,
          isDraggable,
          computedCellSize: vue.readonly(computedCellSizeRef),
          startLayout,
          stopLayout,
          getBox: getBox$1,
          updateBox: updateBox$1,
          canStartDrag,
          canStartResize,
          addResizeHandles
        });
        vue.watch(() => props.layout, (newLayout) => {
          layoutRef.value = newLayout;
        });
        const layoutOptionsRef = vue.computed(() => {
          return {
            bubbleUp: props.bubbleUp
          };
        });
        const dragSelectorsRef = vue.computed(() => {
          return getSelectorsFromProp(props.dragSelector);
        });
        const resizeSelectorsRef = vue.computed(() => {
          return getSelectorsFromProp(props.resizeSelector);
        });
        const cursorStyleContentRef = vue.computed(() => {
          if (props.disabled) {
            return "";
          }
          const styleContent = [];
          styleContent.push(
            ...[
              ["", "cursor: var(--dnd-resize-cursor-nwse, nwse-resize);"],
              [":where([dnd-grid-resize=t-], [dnd-grid-resize=b-])", "cursor: var(--dnd-resize-cursor-ns, ns-resize);"],
              [":where([dnd-grid-resize=-r], [dnd-grid-resize=-l])", "cursor: var(--dnd-resize-cursor-ew, ew-resize);"],
              [":where([dnd-grid-resize=tl], [dnd-grid-resize=br])", "cursor: var(--dnd-resize-cursor-nwse, nwse-resize);"],
              [":where([dnd-grid-resize=tr], [dnd-grid-resize=bl])", "cursor: var(--dnd-resize-cursor-nesw, nesw-resize);"]
            ].map(([selector, rules]) => {
              const selectors = getSelectorsFromProp(props.resizeSelector, selector);
              return `
                .dndgrid__box_container[dnd-grid-id="${DND_GRID_ID}"] :not($dndgrid__box_container) ${selectors.join(", ")} {
                    ${rules}
                }
            `;
            }),
            ...[
              ["", "cursor: var(--dnd-drag-cursor, move);"]
            ].map(([selector, rules]) => {
              const selectors = getSelectorsFromProp(props.dragSelector, selector);
              return `
                .dndgrid__box_container[dnd-grid-id="${DND_GRID_ID}"] :not(.dndgrid__box_container) ${selectors.join(", ")} {
                    ${rules}
                }
            `;
            })
          );
          return styleContent.join("\n");
        });
        const cursorStyleSheet = new CSSStyleSheet();
        vue.watch(cursorStyleContentRef, (content) => {
          cursorStyleSheet.replaceSync(content);
        }, {
          immediate: true
        });
        vue.onMounted(() => {
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursorStyleSheet];
        });
        vue.onBeforeUnmount(() => {
          const index = document.adoptedStyleSheets.indexOf(cursorStyleSheet);
          if (index > -1) {
            document.adoptedStyleSheets = [
              ...document.adoptedStyleSheets.slice(0, index),
              ...document.adoptedStyleSheets.slice(index + 1)
            ];
          }
        });
        function getBox$1(id) {
          return getBox(layoutRef.value, id);
        }
        function updateBox$1(id, data) {
          return layoutRef.value = updateBox(props.layout, id, data, layoutOptionsRef.value);
        }
        function toCssSize(value) {
          if (value == void 0) return;
          return isNaN(value) ? value : `${value}px`;
        }
        function updateComputedCellSize() {
          if (containerElRef.value) {
            const style = getComputedStyle(containerElRef.value);
            const width = parseFloat(style.gridTemplateColumns);
            const height = parseFloat(style.gridTemplateRows);
            const spacing = parseFloat(style.gap);
            computedCellSizeRef.value = { width, height, spacing };
          }
          return computedCellSizeRef.value;
        }
        function startLayout() {
          updateComputedCellSize();
          modeRef.value = "layout";
        }
        function stopLayout() {
          emit("update:layout", layoutRef.value);
          modeRef.value = "grid";
        }
        function canStartDrag(evt) {
          return Boolean(evt.target && dragSelectorsRef.value.find((selector) => evt.target.matches(selector)));
        }
        function canStartResize(evt) {
          return Boolean(evt.target && resizeSelectorsRef.value.find((selector) => evt.target.matches(selector)));
        }
        function getSelectorsFromProp(prop, additionalSelector) {
          let selectors = [
            (prop.include || "*") + (additionalSelector || ""),
            (prop.include || "*") + (additionalSelector || "") + " *"
          ];
          if (prop.exclude) {
            selectors = selectors.map((selector) => `${selector}:not(${prop.exclude}, ${prop.exclude} *)`);
          }
          return selectors;
        }
        return (_ctx, _cache) => {
          return vue.openBlock(), vue.createElementBlock("div", {
            ref_key: "containerElRef",
            ref: containerElRef,
            "dnd-grid-id": DND_GRID_ID,
            "dnd-grid-mode": modeRef.value,
            class: "dndgrid__box_container",
            style: vue.normalizeStyle({
              "--dnd-grid-cell-width": toCssSize(props.cellWidth),
              "--dnd-grid-cell-max-width": toCssSize(props.cellMaxWidth) ?? 0,
              "--dnd-grid-cell-height": toCssSize(props.cellHeight),
              "--dnd-grid-cell-max-height": toCssSize(props.cellMaxHeight) ?? 0,
              "--dnd-grid-cell-spacing": toCssSize(props.cellSpacing),
              "--dnd-grid-resize-handler-size": toCssSize(props.resizeHandlerSize),
              "--dnd-grid-resize-handler-offset": toCssSize(props.resizeHandlerOffset),
              "--dnd-grid-placeholder-background": props.placeholderBackground,
              "--dnd-grid-placeholder-border": props.placeholderBorder,
              "--dnd-grid-transition-timing-function": props.transitionTimingFunction,
              "--dnd-grid-transition-duration": props.transitionDuration
            })
          }, [
            vue.renderSlot(_ctx.$slots, "default")
          ], 12, _hoisted_1);
        };
      }
    });

    exports.Box = _sfc_main$1;
    exports.Container = _sfc_main;
    exports.addBox = addBox;
    exports.clamp = clamp;
    exports.createBox = createBox;
    exports.fix = fix;
    exports.fromPixels = fromPixels;
    exports.getBox = getBox;
    exports.getSize = getSize;
    exports.isFree = isFree;
    exports.isOverlapping = isOverlapping;
    exports.moveToFreePlace = moveToFreePlace;
    exports.removeBox = removeBox;
    exports.sort = sort;
    exports.toPixels = toPixels;
    exports.updateBox = updateBox;
    exports.updateBoxData = updateBoxData;
    exports.useDndHandler = useMouseHandler;

    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

}));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG5kLWdyaWQudW1kLmNqcyIsInNvdXJjZXMiOlsiLi4vc3JjL3N5bWJvbHMudHMiLCIuLi9zcmMvdG9vbHMvbGF5b3V0LnRzIiwiLi4vc3JjL2NvbXBvc2FibGVzL3VzZURuZEhhbmRsZXIudHMiLCIuLi9zcmMvY29tcG9uZW50cy9Cb3gudnVlIiwiLi4vc3JjL2NvbXBvbmVudHMvQ29udGFpbmVyLnZ1ZSJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJbmplY3Rpb25LZXksIFJlZiwgU2hhbGxvd1JlZiB9IGZyb20gXCJ2dWVcIjtcbmltcG9ydCB7IExheW91dCwgTGF5b3V0RWxlbWVudCB9IGZyb20gXCIuL3Rvb2xzL2xheW91dFwiO1xuXG5leHBvcnQgdHlwZSBDb21wdXRlZENlbGxTaXplID0ge1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgc3BhY2luZzogbnVtYmVyO1xufTtcblxuZXhwb3J0IHR5cGUgQ29udGFpbmVyUHJvdmlzaW9uID0ge1xuICAgIGxheW91dDogUmVhZG9ubHk8U2hhbGxvd1JlZjxMYXlvdXQ+PixcbiAgICBtb2RlOiBSZWFkb25seTxSZWY8c3RyaW5nPj4sXG4gICAgZGlzYWJsZWQ6IFJlYWRvbmx5PFJlZjxib29sZWFuPj4sXG4gICAgaXNSZXNpemFibGU6IFJlYWRvbmx5PFJlZjxib29sZWFuPj4sXG4gICAgaXNEcmFnZ2FibGU6IFJlYWRvbmx5PFJlZjxib29sZWFuPj4sXG4gICAgY29tcHV0ZWRDZWxsU2l6ZTogUmVhZG9ubHk8UmVmPENvbXB1dGVkQ2VsbFNpemU+PixcbiAgICBzdGFydExheW91dDogKCkgPT4gdm9pZCxcbiAgICBzdG9wTGF5b3V0OiAoKSA9PiB2b2lkLFxuICAgIGdldEJveDogKGlkOiBhbnkpID0+IExheW91dEVsZW1lbnQgfCB1bmRlZmluZWQsXG4gICAgdXBkYXRlQm94OiAoaWQ6IGFueSwgZGF0YTogUGFydGlhbDxMYXlvdXRFbGVtZW50PikgPT4gTGF5b3V0LFxuICAgIGNhblN0YXJ0RHJhZzogKGV2dDogYW55KSA9PiBib29sZWFuLFxuICAgIGNhblN0YXJ0UmVzaXplOiAoZXZ0OiBhbnkpID0+IGJvb2xlYW4sXG4gICAgYWRkUmVzaXplSGFuZGxlczogUmVhZG9ubHk8UmVmPGJvb2xlYW4+Pixcbn07XG5cbmV4cG9ydCBjb25zdCBDb250YWluZXJTeW1ib2wgPSBTeW1ib2woJ0RuZEdyaWRDb250YWluZXInKSBhcyBJbmplY3Rpb25LZXk8Q29udGFpbmVyUHJvdmlzaW9uPjsiLCIvKlxuTGF5b3V0IGpzb25cbltcbiAgICB7IC8vIGVhY2ggYm94IGhhcyBoaXMgb3duIG9iamVjdCBpbiB0aGUgbGF5b3V0IGFycmF5XG4gICAgICAgIGlkOiAxLCAvLyBib3ggaWRlbnRpZmllciAoY2FuIGJlIG9mIGFueSB0eXBlKVxuICAgICAgICBoaWRkZW46IGZhbHNlLCAvLyBpcyBib3ggaGlkZGVuID9cbiAgICAgICAgcGlubmVkOiBmYWxzZSwgLy8gc2hvdWxkIGJveCBzdGF5IGZpeGVkIG9uIGl0cyBwb3NpdGlvblxuICAgICAgICBpc1Jlc2l6YWJsZTogdHJ1ZSwgLy8gYm94IGNhbiBiZSByZXNpemVkXG4gICAgICAgIGlzRHJhZ2dhYmxlOiB0cnVlLCAvLyBib3ggY2FuIGJlIGRyYWdnZWRcbiAgICAgICAgcG9zaXRpb246IHsgLy8gYm94IHBvc2l0aW9uIGluIHRoZSBsYXlvdXQgZ3JpZFxuICAgICAgICAgICAgeDogMSwgLy8gaG9yaXpvbnRhbCBwb3NpdGlvbiBzdGFydGluZyB3aXRoIDFcbiAgICAgICAgICAgIHk6IDEsIC8vIHZlcnRpY2FsIHBvc2l0aW9uIHN0YXJ0aW5nIHdpdGggMVxuICAgICAgICAgICAgdzogNSwgLy8gYm94IHdpZHRoXG4gICAgICAgICAgICBoOiAyICAvLyBib3ggaGVpZ2h0XG4gICAgICAgIH1cbiAgICB9LFxuICAgIC4uLlxuXVxuKi9cbnR5cGUgUG9zaXRpb24gPSB7XG4gICAgLyoqIGhvcml6b250YWwgcG9zaXRpb24gc3RhcnRpbmcgd2l0aCAxICovXG4gICAgeDogbnVtYmVyLFxuICAgIC8qKiB2ZXJ0aWNhbCBwb3NpdGlvbiBzdGFydGluZyB3aXRoIDEgKi9cbiAgICB5OiBudW1iZXIsXG4gICAgLyoqIGJveCB3aWR0aCAqL1xuICAgIHc6IG51bWJlcixcbiAgICAvKiogYm94IGhlaWdodCAqL1xuICAgIGg6IG51bWJlcixcbn1cbmV4cG9ydCB0eXBlIEdyaWRQb3NpdGlvbiA9IFBvc2l0aW9uO1xuZXhwb3J0IHR5cGUgUGl4ZWxQb3NpdGlvbiA9IFBvc2l0aW9uO1xuXG5leHBvcnQgdHlwZSBTaXplTGltaXRzID0ge1xuICAgIG1pbldpZHRoOiBudW1iZXIsXG4gICAgbWluSGVpZ2h0OiBudW1iZXIsXG4gICAgbWF4V2lkdGg6IG51bWJlcixcbiAgICBtYXhIZWlnaHQ6IG51bWJlcixcbn1cblxuZXhwb3J0IHR5cGUgTGF5b3V0RWxlbWVudCA9IHtcbiAgICAvKiogQm94IGlkZW50aWZpZXIgKGNhbiBiZSBhbnkgdHlwZSkgKi9cbiAgICBpZDogYW55LCBcbiAgICAvKiogaXMgYm94IGhpZGRlbj8gKi9cbiAgICBoaWRkZW4/OiBib29sZWFuLFxuICAgIC8qKiBzaG91bGQgYm94IHN0YXkgZml4ZWQgb24gaXRzIHBvc2l0aW9uICovXG4gICAgcGlubmVkPzogYm9vbGVhbixcbiAgICAvKiogYm94IGNhbiBiZSByZXNpemVkICovXG4gICAgaXNSZXNpemFibGU/OiBib29sZWFuLFxuICAgIC8qKiBib3ggY2FuIGJlIGRyYWdnZWQgKi9cbiAgICBpc0RyYWdnYWJsZT86IGJvb2xlYW4sXG4gICAgLyoqIGJveCBwb3NpdGlvbiBpbiB0aGUgbGF5b3V0IGdyaWQgKi9cbiAgICBwb3NpdGlvbjogR3JpZFBvc2l0aW9uLFxuICAgIC8qKiBtaW4vbWF4IHdpZHRoL2hlaWdodCB0aGUgYm94IGNhbiBiZSByZXNpemVkIHRvICovXG4gICAgcmVzaXplTGltaXRzPzogU2l6ZUxpbWl0cyxcbn1cblxuZXhwb3J0IHR5cGUgTGF5b3V0T3B0aW9ucyA9IHtcbiAgICBidWJibGVVcD86IGJvb2xlYW4gfCBcImp1bXAtb3ZlclwiLFxufVxuXG5leHBvcnQgdHlwZSBMYXlvdXQgPSByZWFkb25seSBMYXlvdXRFbGVtZW50W107XG5cbi8vIHNvcnQgbGF5b3V0IGJhc2VkIG9uIHBvc2l0aW9uIGFuZCB2aXNpYmlsaXR5XG5leHBvcnQgZnVuY3Rpb24gc29ydCAobGF5b3V0OiBMYXlvdXQpIHtcbiAgICByZXR1cm4gWy4uLmxheW91dF0uc29ydCgoYSwgYikgPT4ge1xuICAgICAgICBpZiAoYS5oaWRkZW4gJiYgIWIuaGlkZGVuKSB7XG4gICAgICAgICAgICByZXR1cm4gMVxuICAgICAgICB9XG4gICAgICAgIGlmICghYS5oaWRkZW4gJiYgYi5oaWRkZW4pIHtcbiAgICAgICAgICAgIHJldHVybiAtMVxuICAgICAgICB9XG4gICAgICAgIGlmIChhLnBvc2l0aW9uLnkgPCBiLnBvc2l0aW9uLnkpIHtcbiAgICAgICAgICAgIHJldHVybiAtMVxuICAgICAgICB9XG4gICAgICAgIGlmIChhLnBvc2l0aW9uLnkgPiBiLnBvc2l0aW9uLnkpIHtcbiAgICAgICAgICAgIHJldHVybiAxXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGEucG9zaXRpb24ueCA8IGIucG9zaXRpb24ueCkge1xuICAgICAgICAgICAgcmV0dXJuIC0xXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGEucG9zaXRpb24ueCA+IGIucG9zaXRpb24ueCkge1xuICAgICAgICAgICAgcmV0dXJuIDFcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMFxuICAgIH0pXG59XG5cbi8vIGNoZWNrIGlmIHBvc2l0aW9uIGlzIGZyZWUgaW4gbGF5b3V0XG5leHBvcnQgZnVuY3Rpb24gaXNGcmVlIChsYXlvdXQ6IHJlYWRvbmx5IExheW91dEVsZW1lbnRbXSwgcG9zaXRpb246IEdyaWRQb3NpdGlvbiwgZmlsdGVyID0gKF9sYXlvdXQ6IExheW91dEVsZW1lbnQpID0+IHRydWUpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxheW91dC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoIWZpbHRlcihsYXlvdXRbaV0pKSBjb250aW51ZVxuICAgICAgICBpZiAoaXNPdmVybGFwcGluZyhsYXlvdXRbaV0ucG9zaXRpb24sIHBvc2l0aW9uKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWVcbn1cblxuLy8gZ2V0IGxheW91dCBzaXplIGJhc2VkIG9uIGJveGVzXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2l6ZSAobGF5b3V0OiByZWFkb25seSBMYXlvdXRFbGVtZW50W10pIHtcbiAgICBsZXQgdyA9IDBcbiAgICBsZXQgaCA9IDBcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxheW91dC5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBib3ggPSBsYXlvdXRbaV1cbiAgICAgICAgaWYgKGJveC5oaWRkZW4pIGNvbnRpbnVlXG4gICAgICAgIHcgPSBNYXRoLm1heCh3LCBib3gucG9zaXRpb24ueCArIGJveC5wb3NpdGlvbi53KVxuICAgICAgICBoID0gTWF0aC5tYXgoaCwgYm94LnBvc2l0aW9uLnkgKyBib3gucG9zaXRpb24uaClcbiAgICB9XG4gICAgcmV0dXJuIHsgdywgaCB9XG59XG5cbi8vIHVwZGF0ZXMgYm94IHBvc2l0aW9uIHRvIGEgZnJlZSBwbGFjZSBpbiBhIGdpdmVuIGxheW91dFxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVUb0ZyZWVQbGFjZSAobGF5b3V0OiByZWFkb25seSBMYXlvdXRFbGVtZW50W10sIGJveDogTGF5b3V0RWxlbWVudCwgbGF5b3V0T3B0aW9ucz86IExheW91dE9wdGlvbnMpIHtcbiAgICBpZiAoYm94LnBpbm5lZCkge1xuICAgICAgICByZXR1cm4gYm94XG4gICAgfVxuICAgIGNvbnN0IG5ld1Bvc2l0aW9uID0geyAuLi5ib3gucG9zaXRpb24gfVxuICAgIGNvbnN0IGluaXRpYWxZID0gbmV3UG9zaXRpb24ueVxuXG4gICAgaWYgKGxheW91dE9wdGlvbnM/LmJ1YmJsZVVwICYmIG5ld1Bvc2l0aW9uLnkgPiAwKSB7XG4gICAgICAgIGlmIChsYXlvdXRPcHRpb25zPy5idWJibGVVcCA9PT0gJ2p1bXAtb3ZlcicpIHtcbiAgICAgICAgICAgIG5ld1Bvc2l0aW9uLnkgPSAwXG4gICAgICAgIH1cblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBuZXdQb3NpdGlvbi55LS1cbiAgICAgICAgfSB3aGlsZSAoXG4gICAgICAgICAgICBuZXdQb3NpdGlvbi55ID49IDAgJiZcbiAgICAgICAgICAgIGlzRnJlZShsYXlvdXQsIG5ld1Bvc2l0aW9uLCBfYm94ID0+IF9ib3guaWQgIT09IGJveC5pZClcbiAgICAgICAgKVxuICAgICAgICBuZXdQb3NpdGlvbi55KytcbiAgICB9XG5cbiAgICB3aGlsZSAoIWlzRnJlZShsYXlvdXQsIG5ld1Bvc2l0aW9uLCBfYm94ID0+IF9ib3guaWQgIT09IGJveC5pZCkpIHtcbiAgICAgICAgbmV3UG9zaXRpb24ueSsrXG4gICAgfVxuXG4gICAgaWYgKG5ld1Bvc2l0aW9uLnkgPT09IGluaXRpYWxZKSB7XG4gICAgICAgIHJldHVybiBib3hcbiAgICB9XG5cbiAgICByZXR1cm4gdXBkYXRlQm94RGF0YShib3gsIHsgcG9zaXRpb246IG5ld1Bvc2l0aW9uIH0pXG59XG5cbi8vIGltbXV0YWJsZSBib3ggZGF0YSBtZXJnZVxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUJveERhdGEgKGJveDogTGF5b3V0RWxlbWVudCwgZGF0YTogUGFydGlhbDxMYXlvdXRFbGVtZW50PiA9IHt9KSB7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXVudXNlZC12YXJzXG4gICAgY29uc3QgeyBpZCwgcG9zaXRpb24sIC4uLmxheW91dE9wdGlvbnMgfSA9IGRhdGFcbiAgICByZXR1cm4ge1xuICAgICAgICAuLi5ib3gsXG4gICAgICAgIC4uLmxheW91dE9wdGlvbnMsXG4gICAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgICAgICAuLi5ib3gucG9zaXRpb24sXG4gICAgICAgICAgICAuLi5wb3NpdGlvblxuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBmaXggbGF5b3V0IGJhc2VkIG9uIGxheW91dE9wdGlvbnNcbmV4cG9ydCBmdW5jdGlvbiBmaXggKGxheW91dDogTGF5b3V0LCBsYXlvdXRPcHRpb25zPzogTGF5b3V0T3B0aW9ucykge1xuICAgIGxldCBuZXdMYXlvdXQgPSBzb3J0KGxheW91dClcbiAgICBpZiAobGF5b3V0T3B0aW9ucz8uYnViYmxlVXApIHtcbiAgICAgICAgbmV3TGF5b3V0LmZvckVhY2goKGJveCwgaW5kZXgpID0+IHtcbiAgICAgICAgICAgIG5ld0xheW91dFtpbmRleF0gPSBtb3ZlVG9GcmVlUGxhY2UobmV3TGF5b3V0LCBib3gsIGxheW91dE9wdGlvbnMpXG4gICAgICAgIH0pXG4gICAgICAgIG5ld0xheW91dCA9IHNvcnQobmV3TGF5b3V0KVxuICAgIH1cbiAgICByZXR1cm4gbmV3TGF5b3V0XG59XG5cbi8vIGdldCBib3ggYnkgaWRcbmV4cG9ydCBmdW5jdGlvbiBnZXRCb3ggKGxheW91dDogTGF5b3V0LCBpZDogYW55KSB7XG4gICAgcmV0dXJuIF9nZXRCb3gobGF5b3V0LCBpZCkuYm94XG59XG5cbi8vIGNyZWF0ZSBib3hcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVCb3ggKGxheW91dDogTGF5b3V0LCBpZDogYW55LCBkYXRhOiBQYXJ0aWFsPExheW91dEVsZW1lbnQ+LCBsYXlvdXRPcHRpb25zOiBMYXlvdXRPcHRpb25zKSB7XG4gICAgbGV0IGJveCA9IHsgaWQsIHBvc2l0aW9uOiB7IHg6IDAsIHk6IDAsIHc6IDEsIGg6IDEgfSB9XG4gICAgaWYgKGRhdGEpIHtcbiAgICAgICAgYm94ID0gdXBkYXRlQm94RGF0YShib3gsIGRhdGEpXG4gICAgfVxuICAgIHJldHVybiBtb3ZlVG9GcmVlUGxhY2UobGF5b3V0LCBib3gsIGxheW91dE9wdGlvbnMpXG59XG5cbmZ1bmN0aW9uIHBsYWNlQm94IChsYXlvdXQ6IExheW91dCwgYm94OiBMYXlvdXRFbGVtZW50LCBsYXlvdXRPcHRpb25zOiBMYXlvdXRPcHRpb25zKSB7XG4gICAgbGV0IG5ld0xheW91dCA9IGxheW91dC5maWx0ZXIoX2JveCA9PiBfYm94LmlkICE9PSBib3guaWQgJiYgX2JveC5waW5uZWQpXG4gICAgYm94ID0gbW92ZVRvRnJlZVBsYWNlKG5ld0xheW91dCwgYm94KVxuICAgIG5ld0xheW91dC5wdXNoKGJveClcblxuICAgIHNvcnQobGF5b3V0KS5mb3JFYWNoKF9ib3ggPT4ge1xuICAgICAgICBpZiAoX2JveC5pZCA9PT0gYm94LmlkIHx8IF9ib3gucGlubmVkKSByZXR1cm5cbiAgICAgICAgbmV3TGF5b3V0LnB1c2gobW92ZVRvRnJlZVBsYWNlKG5ld0xheW91dCwgX2JveCkpXG4gICAgfSlcblxuICAgIHJldHVybiBmaXgobmV3TGF5b3V0LCBsYXlvdXRPcHRpb25zKVxufVxuXG4vLyBhZGQgYm94XG5leHBvcnQgZnVuY3Rpb24gYWRkQm94IChsYXlvdXQ6IExheW91dCwgYm94OiBMYXlvdXRFbGVtZW50LCBsYXlvdXRPcHRpb25zOiBMYXlvdXRPcHRpb25zKSB7XG4gICAgY29uc3QgeyBpbmRleCwgYm94OiBfYm94IH0gPSBfZ2V0Qm94KGxheW91dCwgYm94LmlkKVxuICAgIGlmIChib3ggPT09IF9ib3ggfHwgaW5kZXggPiAtMSkge1xuICAgICAgICByZXR1cm4gbGF5b3V0XG4gICAgfVxuXG4gICAgcmV0dXJuIHBsYWNlQm94KGxheW91dCwgYm94LCBsYXlvdXRPcHRpb25zKVxufVxuXG4vLyB1cGRhdGUgYm94XG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlQm94IChsYXlvdXQ6IExheW91dCwgaWQ6IGFueSwgZGF0YTogUGFydGlhbDxMYXlvdXRFbGVtZW50PiwgbGF5b3V0T3B0aW9uczogTGF5b3V0T3B0aW9ucykge1xuICAgIGNvbnN0IHsgYm94IH0gPSBfZ2V0Qm94KGxheW91dCwgaWQpXG4gICAgaWYgKCFib3gpIHtcbiAgICAgICAgcmV0dXJuIGxheW91dFxuICAgIH1cblxuICAgIHJldHVybiBwbGFjZUJveChsYXlvdXQsIHVwZGF0ZUJveERhdGEoYm94LCBkYXRhKSwgbGF5b3V0T3B0aW9ucylcbn1cblxuLy8gcmVtb3ZlIGJveFxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUJveCAobGF5b3V0OiBMYXlvdXQsIGlkOiBhbnksIGxheW91dE9wdGlvbnM6IExheW91dE9wdGlvbnMpIHtcbiAgICBjb25zdCBpbmRleCA9IF9nZXRCb3gobGF5b3V0LCBpZCkuaW5kZXhcblxuICAgIGlmIChpbmRleCA+IC0xKSB7XG4gICAgICAgIGNvbnN0IG5ld0xheW91dCA9IFsuLi5sYXlvdXRdXG4gICAgICAgIG5ld0xheW91dC5zcGxpY2UoaW5kZXgsIDEpXG4gICAgICAgIHJldHVybiBmaXgobmV3TGF5b3V0LCBsYXlvdXRPcHRpb25zKVxuICAgIH1cblxuICAgIHJldHVybiBsYXlvdXRcbn1cblxuLy8gY2hlY2sgaWYgMiBwb3NpdGlvbnMgYXJlIG92ZXJsYXBwaW5nXG5leHBvcnQgZnVuY3Rpb24gaXNPdmVybGFwcGluZyAocG9zaXRpb25BOiBHcmlkUG9zaXRpb24sIHBvc2l0aW9uQjogR3JpZFBvc2l0aW9uKSB7XG4gICAgcmV0dXJuIHBvc2l0aW9uQS54IDwgKHBvc2l0aW9uQi54ICsgcG9zaXRpb25CLncpICYmXG4gICAgICAgIChwb3NpdGlvbkEueCArIHBvc2l0aW9uQS53KSA+IHBvc2l0aW9uQi54ICYmXG4gICAgICAgIHBvc2l0aW9uQS55IDwgKHBvc2l0aW9uQi55ICsgcG9zaXRpb25CLmgpICYmXG4gICAgICAgIChwb3NpdGlvbkEueSArIHBvc2l0aW9uQS5oKSA+IHBvc2l0aW9uQi55XG59XG5cbi8vIGdldCBib3ggcG9zaXRpb24gaW4gcGl4ZWxzXG5leHBvcnQgZnVuY3Rpb24gdG9QaXhlbHMgKHBvc2l0aW9uOiBHcmlkUG9zaXRpb24sIGNlbGxXaWR0aDogbnVtYmVyLCBjZWxsSGVpZ2h0OiBudW1iZXIsIHNwYWNpbmc6IG51bWJlciA9IDApOiBQaXhlbFBvc2l0aW9uIHtcbiAgICBjb25zdCBwaXhlbHM6IFBhcnRpYWw8UGl4ZWxQb3NpdGlvbj4gPSB7fTtcbiAgICBmb3IgKGxldCBrZXkgaW4gcG9zaXRpb24gfHwge30pIHtcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICAgIGNhc2UgJ3gnOlxuICAgICAgICAgICAgICAgIHBpeGVsc1trZXldID0gcG9zaXRpb24ueCAqIChjZWxsV2lkdGggKyBzcGFjaW5nKVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICd5JzpcbiAgICAgICAgICAgICAgICBwaXhlbHNba2V5XSA9IHBvc2l0aW9uLnkgKiAoY2VsbEhlaWdodCArIHNwYWNpbmcpXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgJ3cnOlxuICAgICAgICAgICAgICAgIHBpeGVsc1trZXldID0gKHBvc2l0aW9uLncgKiAoY2VsbFdpZHRoICsgc3BhY2luZykpIC0gc3BhY2luZ1xuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICdoJzpcbiAgICAgICAgICAgICAgICBwaXhlbHNba2V5XSA9IChwb3NpdGlvbi5oICogKGNlbGxIZWlnaHQgKyBzcGFjaW5nKSkgLSBzcGFjaW5nXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGl4ZWxzIGFzIFBpeGVsUG9zaXRpb247XG59XG5cbi8vIGdldCBib3ggcG9zaXRpb24gZnJvbSBwaXhlbHNcbmV4cG9ydCBmdW5jdGlvbiBmcm9tUGl4ZWxzIChwaXhlbHM6IFBpeGVsUG9zaXRpb24sIGNlbGxXaWR0aDogbnVtYmVyLCBjZWxsSGVpZ2h0OiBudW1iZXIsIHNwYWNpbmc6IG51bWJlciA9IDApOiBHcmlkUG9zaXRpb24ge1xuICAgIGNvbnN0IHBvc2l0aW9uOiBQYXJ0aWFsPEdyaWRQb3NpdGlvbj4gPSB7fVxuICAgIGZvciAobGV0IGtleSBpbiBwaXhlbHMgfHwge30pIHtcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICAgIGNhc2UgJ3gnOlxuICAgICAgICAgICAgICAgIHBvc2l0aW9uW2tleV0gPSBNYXRoLmZsb29yKHBpeGVscy54IC8gKGNlbGxXaWR0aCArIHNwYWNpbmcpKVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICd5JzpcbiAgICAgICAgICAgICAgICBwb3NpdGlvbltrZXldID0gTWF0aC5mbG9vcihwaXhlbHMueSAvIChjZWxsSGVpZ2h0ICsgc3BhY2luZykpXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgJ3cnOlxuICAgICAgICAgICAgICAgIHBvc2l0aW9uW2tleV0gPSBNYXRoLmZsb29yKChwaXhlbHMudyArIHNwYWNpbmcpIC8gKGNlbGxXaWR0aCArIHNwYWNpbmcpKVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlICdoJzpcbiAgICAgICAgICAgICAgICBwb3NpdGlvbltrZXldID0gTWF0aC5mbG9vcigocGl4ZWxzLmggKyBzcGFjaW5nKSAvIChjZWxsSGVpZ2h0ICsgc3BhY2luZykpXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcG9zaXRpb24gYXMgR3JpZFBvc2l0aW9uO1xufVxuXG4vLyBnZXQgYm94IGhlbHBlci4gcmV0dXJuIGJveCBhbmQgdGhlIGluZGV4XG5mdW5jdGlvbiBfZ2V0Qm94IChsYXlvdXQ6IExheW91dCwgaWQ6IGFueSkge1xuICAgIGNvbnN0IGluZGV4ID0gbGF5b3V0LmZpbmRJbmRleChib3ggPT4gYm94LmlkID09PSBpZClcbiAgICByZXR1cm4ge1xuICAgICAgICBpbmRleCxcbiAgICAgICAgYm94OiBpbmRleCA+IC0xID8gbGF5b3V0W2luZGV4XSA6IHVuZGVmaW5lZFxuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wKHZhbHVlOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcikge1xuICAgIHJldHVybiBNYXRoLm1pbihtYXgsIE1hdGgubWF4KG1pbiwgdmFsdWUpKTtcbn0iLCJpbXBvcnQgeyBvblNjb3BlRGlzcG9zZSB9IGZyb20gJ3Z1ZSdcblxudHlwZSBNb3VzZUNhbGxiYWNrQXJnID0ge1xuICAgIHN0YXJ0WDogbnVtYmVyXG4gICAgc3RhcnRZOiBudW1iZXJcbiAgICBvZmZzZXRYOiBudW1iZXJcbiAgICBvZmZzZXRZOiBudW1iZXJcbn1cblxuZXhwb3J0IHR5cGUgRXZlbnRIYW5kbGVyQ2FsbGJhY2sgPSAobW92ZW1lbnQ6IE1vdXNlQ2FsbGJhY2tBcmcsIGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQgfCB1bmRlZmluZWQpID0+IHZvaWRcblxuZXhwb3J0IHR5cGUgQ2FsbGJhY2tzID0ge1xuICAgIGFsbG93PzogKGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQpID0+IGJvb2xlYW5cbiAgICBzdGFydD86IChtb3ZlbWVudDogTW91c2VDYWxsYmFja0FyZywgZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkgPT4gdm9pZDtcbiAgICBzdG9wPzogKG1vdmVtZW50OiBNb3VzZUNhbGxiYWNrQXJnLCBldnQ6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50IHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xuICAgIHVwZGF0ZT86IChtb3ZlbWVudDogTW91c2VDYWxsYmFja0FyZywgZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkgPT4gdm9pZDtcbn1cblxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiB1c2VNb3VzZUhhbmRsZXIgKGNhbGxiYWNrczogQ2FsbGJhY2tzID0ge30pIHtcbiAgICBsZXQgaGFzU3RhcnRlZCA9IGZhbHNlXG4gICAgbGV0IGlzQWN0aXZlID0gZmFsc2VcbiAgICBsZXQgaXNUb3VjaCA9IGZhbHNlXG4gICAgbGV0IHN0YXJ0RXZlbnQ6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50IHwgdW5kZWZpbmVkO1xuICAgIGxldCBzdGFydFg6IG51bWJlciB8IHVuZGVmaW5lZFxuICAgIGxldCBzdGFydFk6IG51bWJlciB8IHVuZGVmaW5lZFxuICAgIGxldCBvZmZzZXRYOiBudW1iZXIgfCB1bmRlZmluZWRcbiAgICBsZXQgb2Zmc2V0WTogbnVtYmVyIHwgdW5kZWZpbmVkXG5cbiAgICBmdW5jdGlvbiBkb1VwZGF0ZSAodHlwZTogXCJzdGFydFwiIHwgXCJzdG9wXCIgfCBcInVwZGF0ZVwiLCBldnQ6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChldnQpIHtcbiAgICAgICAgICAgIG9mZnNldFggPSAoaXNUb3VjaCA/IChldnQgYXMgVG91Y2hFdmVudCkuY2hhbmdlZFRvdWNoZXNbMF0ucGFnZVggOiAoZXZ0IGFzIE1vdXNlRXZlbnQpLnBhZ2VYKSAtIHN0YXJ0WCFcbiAgICAgICAgICAgIG9mZnNldFkgPSAoaXNUb3VjaCA/IChldnQgYXMgVG91Y2hFdmVudCkuY2hhbmdlZFRvdWNoZXNbMF0ucGFnZVkgOiAoZXZ0IGFzIE1vdXNlRXZlbnQpLnBhZ2VZKSAtIHN0YXJ0WSFcbiAgICAgICAgfVxuXG4gICAgICAgIGNhbGxiYWNrc1t0eXBlXT8uKHsgc3RhcnRYOiBzdGFydFghLCBzdGFydFk6IHN0YXJ0WSEsIG9mZnNldFg6IG9mZnNldFghLCBvZmZzZXRZOiBvZmZzZXRZISB9LCBldnQpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25TdGFydCAoZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkge1xuICAgICAgICBpZiAoZXZ0LmRlZmF1bHRQcmV2ZW50ZWQgfHwgaGFzU3RhcnRlZCB8fCAhY2FsbGJhY2tzPy5bJ2FsbG93J10/LihldnQpKSByZXR1cm5cbiAgICAgICAgZXZ0LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgICAgIGV2dC5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAgICAgaGFzU3RhcnRlZCA9IHRydWVcbiAgICAgICAgaXNUb3VjaCA9IGV2dC50eXBlID09PSAndG91Y2hzdGFydCdcbiAgICAgICAgc3RhcnRFdmVudCA9IGV2dFxuICAgICAgICBzdGFydFggPSBpc1RvdWNoID8gKGV2dCBhcyBUb3VjaEV2ZW50KS5jaGFuZ2VkVG91Y2hlc1swXS5wYWdlWCA6IChldnQgYXMgTW91c2VFdmVudCkucGFnZVhcbiAgICAgICAgc3RhcnRZID0gaXNUb3VjaCA/IChldnQgYXMgVG91Y2hFdmVudCkuY2hhbmdlZFRvdWNoZXNbMF0ucGFnZVkgOiAoZXZ0IGFzIE1vdXNlRXZlbnQpLnBhZ2VZXG5cbiAgICAgICAgaWYgKGlzVG91Y2gpIHtcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIG9uQ2FuY2VsLCB7IG9uY2U6IHRydWUgfSlcbiAgICAgICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGVuZCcsIG9uU3RvcCwgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgb25Nb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIG9uU3RvcCwgeyBvbmNlOiB0cnVlIH0pXG4gICAgICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgb25Nb3ZlLCB7IHBhc3NpdmU6IGZhbHNlIH0pXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvblN0b3AgKGV2dDogTW91c2VFdmVudCB8IFRvdWNoRXZlbnQgfCB1bmRlZmluZWQpIHtcbiAgICAgICAgZXZ0Py5zdG9wUHJvcGFnYXRpb24oKVxuICAgICAgICBldnQ/LnByZXZlbnREZWZhdWx0KClcblxuICAgICAgICBpZiAoaXNUb3VjaCkge1xuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgb25DYW5jZWwsIHsgb25jZTogdHJ1ZSB9IGFzIEV2ZW50TGlzdGVuZXJPcHRpb25zKVxuICAgICAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgb25TdG9wLCB7IG9uY2U6IHRydWUgfSBhcyBFdmVudExpc3RlbmVyT3B0aW9ucylcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCBvbk1vdmUsIHsgcGFzc2l2ZTogZmFsc2UgfSBhcyBFdmVudExpc3RlbmVyT3B0aW9ucylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgb25TdG9wLCB7IG9uY2U6IHRydWUgfSBhcyBFdmVudExpc3RlbmVyT3B0aW9ucylcbiAgICAgICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBvbk1vdmUsIHsgcGFzc2l2ZTogZmFsc2UgfSBhcyBFdmVudExpc3RlbmVyT3B0aW9ucylcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0FjdGl2ZSkge1xuICAgICAgICAgICAgZG9VcGRhdGUoJ3N0b3AnLCBldnQpXG4gICAgICAgIH1cblxuICAgICAgICBoYXNTdGFydGVkID0gZmFsc2VcbiAgICAgICAgaXNBY3RpdmUgPSBmYWxzZVxuICAgICAgICBzdGFydEV2ZW50ID0gdW5kZWZpbmVkXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25DYW5jZWwgKGV2dD86IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50IHwgdW5kZWZpbmVkKSB7XG4gICAgICAgIGV2dD8uc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgZXZ0Py5wcmV2ZW50RGVmYXVsdCgpXG5cbiAgICAgICAgcmV0dXJuIG9uU3RvcChzdGFydEV2ZW50KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9uTW92ZSAoZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkge1xuICAgICAgICBldnQuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgZXZ0LnByZXZlbnREZWZhdWx0KClcblxuICAgICAgICBpZiAoIWlzQWN0aXZlKSB7XG4gICAgICAgICAgICBpc0FjdGl2ZSA9IHRydWVcbiAgICAgICAgICAgIGRvVXBkYXRlKCdzdGFydCcsIHN0YXJ0RXZlbnQpXG4gICAgICAgIH1cblxuICAgICAgICBkb1VwZGF0ZSgndXBkYXRlJywgZXZ0KVxuICAgIH1cblxuICAgIG9uU2NvcGVEaXNwb3NlKCgpID0+IG9uQ2FuY2VsKCkpXG5cbiAgICByZXR1cm4ge1xuICAgICAgICB0b3VjaHN0YXJ0OiBvblN0YXJ0LFxuICAgICAgICBtb3VzZWRvd246IG9uU3RhcnRcbiAgICB9XG59XG4iLCI8c2NyaXB0IGxhbmc9XCJ0c1wiPlxuZXhwb3J0IGRlZmF1bHQge1xuICAgIGluaGVyaXRBdHRyczogZmFsc2Vcbn1cbjwvc2NyaXB0PlxuXG48c2NyaXB0IHNldHVwIGxhbmc9XCJ0c1wiPlxuaW1wb3J0IHsgQ29udGFpbmVyU3ltYm9sIH0gZnJvbSAnLi4vc3ltYm9scydcbmltcG9ydCB7IGluamVjdCwgc2hhbGxvd1JlZiwgY29tcHV0ZWQsIG9uU2NvcGVEaXNwb3NlIH0gZnJvbSAndnVlJ1xuaW1wb3J0IHsgdG9QaXhlbHMsIGZyb21QaXhlbHMsIEdyaWRQb3NpdGlvbiwgUGl4ZWxQb3NpdGlvbiwgY2xhbXAgfSBmcm9tICcuLi90b29scy9sYXlvdXQnXG5pbXBvcnQgdXNlRG5kSGFuZGxlciBmcm9tICcuLi9jb21wb3NhYmxlcy91c2VEbmRIYW5kbGVyJ1xuXG5jb25zdCBwcm9wcyA9IGRlZmluZVByb3BzKHtcbiAgICBib3hJZDoge1xuICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgdHlwZTogbnVsbCBhcyBhbnksXG4gICAgfSxcblxuICAgIG92ZXJmbG93OiB7XG4gICAgICAgIHR5cGU6IFN0cmluZyxcbiAgICAgICAgZGVmYXVsdDogJ2hpZGRlbidcbiAgICB9XG59KVxuXG5jb25zdCB7XG4gICAgY29tcHV0ZWRDZWxsU2l6ZTogY29tcHV0ZWRDZWxsU2l6ZVJlZixcbiAgICBkaXNhYmxlZDogZGlzYWJsZWRSZWYsXG4gICAgaXNSZXNpemFibGU6IGlzUmVzaXphYmxlUmVmLFxuICAgIGlzRHJhZ2dhYmxlOiBpc0RyYWdnYWJsZVJlZixcbiAgICBhZGRSZXNpemVIYW5kbGVzOiBhZGRSZXNpemVIYW5kbGVzUmVmLFxuICAgIGNhblN0YXJ0RHJhZyxcbiAgICBjYW5TdGFydFJlc2l6ZSxcbiAgICBnZXRCb3gsXG4gICAgdXBkYXRlQm94LFxuICAgIHN0YXJ0TGF5b3V0LFxuICAgIHN0b3BMYXlvdXQsXG59ID0gaW5qZWN0KENvbnRhaW5lclN5bWJvbCkhO1xuXG5jb25zdCBvdmVybGF5RWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxub3ZlcmxheUVsLmNsYXNzTGlzdC5hZGQoXCJkbmRncmlkX19ib3hfb3ZlcmxheVwiKVxuXG5jb25zdCBzbG90Q29udGFpbmVyRWxSZWYgPSBzaGFsbG93UmVmKClcbmNvbnN0IGJveEVsUmVmID0gc2hhbGxvd1JlZigpXG5cbi8vIFRPRE8gcmVzb2x2ZSBleHRyYSBwYXJhbWV0ZXJcbi8vY29uc3QgYm94UmVmID0gY29tcHV0ZWQoKCkgPT4gZ2V0Qm94KHByb3BzLmJveElkLCB0cnVlKSEpO1xuY29uc3QgYm94UmVmID0gY29tcHV0ZWQoKCkgPT4gZ2V0Qm94KHByb3BzLmJveElkKSEpO1xuY29uc3QgdmlzaWJsZVJlZiA9IGNvbXB1dGVkKCgpID0+IGJveFJlZi52YWx1ZSAmJiAhKGJveFJlZi52YWx1ZS5oaWRkZW4gPz8gZmFsc2UpKVxuXG4vLyBncmlkIG1vZGVcbmNvbnN0IHBvc2l0aW9uUmVmID0gY29tcHV0ZWQoKCkgPT4gYm94UmVmLnZhbHVlPy5wb3NpdGlvbilcbmNvbnN0IGNzc1Bvc2l0aW9uUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gcG9zaXRpb25SZWYudmFsdWVcbiAgICBjb25zdCBwaXhlbHMgPSBjc3NQaXhlbHNSZWYudmFsdWU7XG4gICAgY29uc3QgYmFzZVBpeGVscyA9IGJhc2VDc3NQaXhlbHNSZWYudmFsdWU7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJy0tZG5kLWdyaWQtYm94LXgnOiAocG9zaXRpb24/LnggPz8gMCkgKyAxLFxuICAgICAgICAnLS1kbmQtZ3JpZC1ib3gteSc6IChwb3NpdGlvbj8ueSA/PyAwKSArIDEsXG4gICAgICAgICctLWRuZC1ncmlkLWJveC13aWR0aCc6IHBvc2l0aW9uPy53ID8/IDAsXG4gICAgICAgICctLWRuZC1ncmlkLWJveC1oZWlnaHQnOiBwb3NpdGlvbj8uaCA/PyAwLFxuICAgICAgICAnLS1kbmRncmlkX19ib3hfYm94X2Nzc1BpeGVscy14JzogcGl4ZWxzPy54ID8/IDAsXG4gICAgICAgICctLWRuZGdyaWRfX2JveF9ib3hfY3NzUGl4ZWxzLXknOiBwaXhlbHM/LnkgPz8gMCxcbiAgICAgICAgJy0tZG5kZ3JpZF9fYm94X2JveF9jc3NQaXhlbHMtdyc6IHBpeGVscz8udyA/PyAwLFxuICAgICAgICAnLS1kbmRncmlkX19ib3hfYm94X2Nzc1BpeGVscy1oJzogcGl4ZWxzPy5oID8/IDAsXG4gICAgICAgICctLWRuZGdyaWRfX2JveF9ib3hfYmFzZUNzc1BpeGVscy14JzogYmFzZVBpeGVscz8ueCA/PyAwLFxuICAgICAgICAnLS1kbmRncmlkX19ib3hfYm94X2Jhc2VDc3NQaXhlbHMteSc6IGJhc2VQaXhlbHM/LnkgPz8gMCxcbiAgICAgICAgJy0tZG5kZ3JpZF9fYm94X2JveF9iYXNlQ3NzUGl4ZWxzLXcnOiBiYXNlUGl4ZWxzPy53ID8/IDAsXG4gICAgICAgICctLWRuZGdyaWRfX2JveF9ib3hfYmFzZUNzc1BpeGVscy1oJzogYmFzZVBpeGVscz8uaCA/PyAwLFxuICAgIH1cbn0pXG5cbi8vIGxheW91dGluZyBtb2RlXG5jb25zdCBwaXhlbHNSZWYgPSBjb21wdXRlZCgoKSA9PiB7XG4gICAgaWYgKCFwb3NpdGlvblJlZi52YWx1ZSB8fCAhY29tcHV0ZWRDZWxsU2l6ZVJlZi52YWx1ZSkgcmV0dXJuXG4gICAgY29uc3QgeyB3aWR0aCwgaGVpZ2h0LCBzcGFjaW5nIH0gPSBjb21wdXRlZENlbGxTaXplUmVmLnZhbHVlXG4gICAgcmV0dXJuIHRvUGl4ZWxzKFxuICAgICAgICBib3hSZWYudmFsdWUucG9zaXRpb24sXG4gICAgICAgIHdpZHRoLFxuICAgICAgICBoZWlnaHQsXG4gICAgICAgIHNwYWNpbmdcbiAgICApXG59KVxuY29uc3QgY3NzUGl4ZWxzUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIGNvbnN0IHBpeGVscyA9IHBpeGVsc1JlZi52YWx1ZVxuICAgIHJldHVybiB7XG4gICAgICAgIHg6IGAke3BpeGVscz8ueCA/PyAwfXB4YCxcbiAgICAgICAgeTogYCR7cGl4ZWxzPy55ID8/IDB9cHhgLFxuICAgICAgICB3OiBgJHtwaXhlbHM/LncgPz8gMH1weGAsXG4gICAgICAgIGg6IGAke3BpeGVscz8uaCA/PyAwfXB4YFxuICAgIH1cbn0pXG5cbmNvbnN0IGlzQm94UmVzaXphYmxlUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIHJldHVybiAoIWRpc2FibGVkUmVmLnZhbHVlIC8vIGRuZCBpcyBlbmFibGVkXG4gICAgICAgICYmIGlzUmVzaXphYmxlUmVmLnZhbHVlIC8vIHJlc2l6aW5nIGlzIGVuYWJsZWRcbiAgICAgICAgJiYgKGJveFJlZi52YWx1ZT8uaXNSZXNpemFibGUgPz8gdHJ1ZSkgLy8gYm94IHJlc2l6aW5nIGlzIGVuYWJsZWQgKGRlZmF1bHRzIHRvIGVuYWJsZWQpXG4gICAgICAgICYmICghYm94UmVmLnZhbHVlPy5waW5uZWQgfHwgYm94UmVmLnZhbHVlPy5pc1Jlc2l6YWJsZSkgLy8gcGlubmVkIGJveGVzIGNhbiBvbmx5IGJlIGRyYWdnZWQgd2hlbiByZXNpemluZyBpcyBleHBsaWNpdGx5IGVuYWJsZWRcbiAgICAgICAgKSA/PyBmYWxzZVxufSlcblxuY29uc3QgaXNCb3hEcmFnZ2FibGVSZWYgPSBjb21wdXRlZCgoKSA9PiB7XG4gICAgcmV0dXJuICghZGlzYWJsZWRSZWYudmFsdWUgLy8gZG5kIGlzIGVuYWJsZWRcbiAgICAgICAgJiYgaXNEcmFnZ2FibGVSZWYudmFsdWUgLy8gZHJhZ2dpbmcgaXMgZW5hYmxlZFxuICAgICAgICAmJiAoYm94UmVmLnZhbHVlPy5pc0RyYWdnYWJsZSA/PyB0cnVlKSAvLyBib3ggZHJhZ2dpbmcgaXMgZW5hYmxlZCAoZGVmYXVsdHMgdG8gZW5hYmxlZClcbiAgICAgICAgJiYgKCFib3hSZWYudmFsdWU/LnBpbm5lZCB8fCBib3hSZWYudmFsdWU/LmlzRHJhZ2dhYmxlKSAvLyBwaW5uZWQgYm94ZXMgY2FuIG9ubHkgYmUgZHJhZ2dlZCB3aGVuIGRyYWdnaW5nIGlzIGV4cGxpY2l0bHkgZW5hYmxlZFxuICAgICAgICApID8/IGZhbHNlXG59KVxuXG5jb25zdCBiYXNlQ3NzUGl4ZWxzUmVmID0gc2hhbGxvd1JlZih7fSBhcyB7IHg6IHN0cmluZywgeTogc3RyaW5nLCB3OiBzdHJpbmcsIGg6IHN0cmluZyB9KVxubGV0IGJhc2VQb3NpdGlvbjogR3JpZFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXG5jb25zdCBpc0RyYWdnaW5nUmVmID0gc2hhbGxvd1JlZihmYWxzZSlcbmNvbnN0IGRyYWdFdmVudHMgPSB1c2VEbmRIYW5kbGVyKHtcbiAgICBhbGxvdzogZnVuY3Rpb24gYWxsb3dEcmFnIChldnQpIHtcbiAgICAgICAgcmV0dXJuIGlzQm94RHJhZ2dhYmxlUmVmLnZhbHVlICYmIGNhblN0YXJ0RHJhZyhldnQpIC8vIGNoZWNrIGlmIGV2dCBpcyBhbGxvd2VkIHRvIHN0YXJ0IGRyYWdnaW5nXG4gICAgfSxcbiAgICBzdGFydDogZnVuY3Rpb24gb25EcmFnU3RhcnQgKCkge1xuICAgICAgICBzdGFydExheW91dCgpXG4gICAgICAgIGJhc2VDc3NQaXhlbHNSZWYudmFsdWUgPSBjc3NQaXhlbHNSZWYudmFsdWVcbiAgICAgICAgYmFzZVBvc2l0aW9uID0gcG9zaXRpb25SZWYudmFsdWVcbiAgICAgICAgaXNEcmFnZ2luZ1JlZi52YWx1ZSA9IHRydWVcblxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG92ZXJsYXlFbClcbiAgICAgICAgZG9jdW1lbnQuYm9keS5zZXRBdHRyaWJ1dGUoJ2RuZC1ncmlkLWRyYWcnLCAnJylcbiAgICB9LFxuICAgIHN0b3A6IGZ1bmN0aW9uIG9uRHJhZ1N0b3AgKCkge1xuICAgICAgICBzdG9wTGF5b3V0KClcbiAgICAgICAgaXNEcmFnZ2luZ1JlZi52YWx1ZSA9IGZhbHNlXG4gICAgICAgIHNsb3RDb250YWluZXJFbFJlZi52YWx1ZT8uc3R5bGU/LnJlbW92ZVByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtbGVmdCcpXG4gICAgICAgIHNsb3RDb250YWluZXJFbFJlZi52YWx1ZT8uc3R5bGU/LnJlbW92ZVByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtdG9wJylcblxuICAgICAgICBvdmVybGF5RWwucmVtb3ZlKClcbiAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVBdHRyaWJ1dGUoJ2RuZC1ncmlkLWRyYWcnKVxuICAgIH0sXG4gICAgdXBkYXRlOiBmdW5jdGlvbiBvbkRyYWdVcGRhdGUgKHsgb2Zmc2V0WCwgb2Zmc2V0WSB9KSB7XG4gICAgICAgIGxldCBvZmZzZXRQaXhlbHMgPSB7IHg6IG9mZnNldFgsIHk6IG9mZnNldFksIHc6IDAsIGg6IDAgfVxuICAgICAgICBhcHBseU9mZnNldFBpeGVscyhiYXNlUG9zaXRpb24sIG9mZnNldFBpeGVscylcbiAgICB9XG59KVxuXG5jb25zdCBpc1Jlc2l6aW5nUmVmID0gc2hhbGxvd1JlZihmYWxzZSlcbmxldCByZXNpemVNb2RlOiB1bmRlZmluZWQgfCBcInQtXCIgfCBcIi1yXCIgfCBcImItXCIgfCBcIi1sXCIgfCBcInRsXCIgfCBcInRyXCIgfCBcImJyXCIgfCBcImJsXCJcbmNvbnN0IHJlc2l6ZUV2ZW50cyA9IHVzZURuZEhhbmRsZXIoe1xuICAgIGFsbG93OiBmdW5jdGlvbiBhbGxvd1Jlc2l6ZSAoZXZ0KSB7XG4gICAgICAgIHJldHVybiBpc0JveFJlc2l6YWJsZVJlZi52YWx1ZSAmJiBjYW5TdGFydFJlc2l6ZShldnQpXG4gICAgfSxcbiAgICBzdGFydDogZnVuY3Rpb24gb25SZXNpemVTdGFydCAoXywgZXZ0KSB7XG4gICAgICAgIHN0YXJ0TGF5b3V0KClcbiAgICAgICAgcmVzaXplTW9kZSA9IChldnQ/LnRhcmdldCBhcyBFbGVtZW50IHwgdW5kZWZpbmVkKT8uZ2V0QXR0cmlidXRlPy4oJ2RuZC1ncmlkLXJlc2l6ZScpIGFzIHR5cGVvZiByZXNpemVNb2RlIHx8ICdicidcbiAgICAgICAgYmFzZUNzc1BpeGVsc1JlZi52YWx1ZSA9IGNzc1BpeGVsc1JlZi52YWx1ZVxuICAgICAgICBiYXNlUG9zaXRpb24gPSBwb3NpdGlvblJlZi52YWx1ZVxuICAgICAgICBpc1Jlc2l6aW5nUmVmLnZhbHVlID0gdHJ1ZVxuXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob3ZlcmxheUVsKVxuICAgICAgICBkb2N1bWVudC5ib2R5LnNldEF0dHJpYnV0ZSgnZG5kLWdyaWQtcmVzaXplJywgcmVzaXplTW9kZSlcbiAgICB9LFxuICAgIHN0b3A6IGZ1bmN0aW9uIG9uUmVzaXplU3RvcCAoKSB7XG4gICAgICAgIHN0b3BMYXlvdXQoKVxuICAgICAgICBpc1Jlc2l6aW5nUmVmLnZhbHVlID0gZmFsc2VcbiAgICAgICAgc2xvdENvbnRhaW5lckVsUmVmLnZhbHVlPy5zdHlsZT8ucmVtb3ZlUHJvcGVydHkoJy0tZG5kLWdyaWQtYm94LW9mZnNldC13aWR0aCcpXG4gICAgICAgIHNsb3RDb250YWluZXJFbFJlZi52YWx1ZT8uc3R5bGU/LnJlbW92ZVByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtaGVpZ2h0JylcblxuICAgICAgICBvdmVybGF5RWwucmVtb3ZlKClcbiAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVBdHRyaWJ1dGUoJ2RuZC1ncmlkLXJlc2l6ZScpXG4gICAgfSxcbiAgICB1cGRhdGU6IGZ1bmN0aW9uIG9uUmVzaXplVXBkYXRlICh7IG9mZnNldFgsIG9mZnNldFkgfSkge1xuICAgICAgICBsZXQgb2Zmc2V0UGl4ZWxzID0geyB4OiAwLCB5OiAwLCB3OiAwLCBoOiAwIH1cblxuICAgICAgICBzd2l0Y2ggKHJlc2l6ZU1vZGU/LlswXSkge1xuICAgICAgICAgICAgY2FzZSAndCc6IC8vIHRvcFxuICAgICAgICAgICAgICAgIG9mZnNldFBpeGVscy55ID0gb2Zmc2V0WVxuICAgICAgICAgICAgICAgIG9mZnNldFBpeGVscy5oID0gLW9mZnNldFlcbiAgICAgICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgICBjYXNlICdiJzogLy8gYm90dG9tXG4gICAgICAgICAgICAgICAgb2Zmc2V0UGl4ZWxzLmggPSBvZmZzZXRZXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuXG4gICAgICAgIHN3aXRjaCAocmVzaXplTW9kZT8uWzFdKSB7XG4gICAgICAgICAgICBjYXNlICdsJzogLy8gbGVmdFxuICAgICAgICAgICAgICAgIG9mZnNldFBpeGVscy54ID0gb2Zmc2V0WFxuICAgICAgICAgICAgICAgIG9mZnNldFBpeGVscy53ID0gLW9mZnNldFhcbiAgICAgICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgICBjYXNlICdyJzogLy8gcmlnaHRcbiAgICAgICAgICAgICAgICBvZmZzZXRQaXhlbHMudyA9IG9mZnNldFhcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICB9XG5cbiAgICAgICAgYXBwbHlPZmZzZXRQaXhlbHMoYmFzZVBvc2l0aW9uLCBvZmZzZXRQaXhlbHMpXG4gICAgfVxufSlcblxuY29uc3QgYm94RXZlbnRzUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIHJldHVybiBtZXJnZUV2ZW50cyhkcmFnRXZlbnRzLCByZXNpemVFdmVudHMpXG59KVxuXG5mdW5jdGlvbiBhcHBseU9mZnNldFBpeGVscyAoYmFzZVBvc2l0aW9uOiBHcmlkUG9zaXRpb24sIG9mZnNldFBpeGVsczogUGl4ZWxQb3NpdGlvbikge1xuICAgIGNvbnN0IHNsb3RDb250YWluZXJFbCA9IHNsb3RDb250YWluZXJFbFJlZi52YWx1ZVxuICAgIGNvbnN0IGNlbGxTaXplID0gY29tcHV0ZWRDZWxsU2l6ZVJlZi52YWx1ZVxuICAgIGNvbnN0IHsgd2lkdGgsIGhlaWdodCwgc3BhY2luZyB9ID0gY29tcHV0ZWRDZWxsU2l6ZVJlZi52YWx1ZVxuXG4gICAgY29uc3Qge1xuICAgICAgICBtaW5XaWR0aCA9IDEsXG4gICAgICAgIG1pbkhlaWdodCA9IDEsXG4gICAgICAgIG1heFdpZHRoID0gSW5maW5pdHksXG4gICAgICAgIG1heEhlaWdodCA9IEluZmluaXR5XG4gICAgfSA9IGJveFJlZi52YWx1ZS5yZXNpemVMaW1pdHMgPz8ge307XG5cbiAgICBjb25zdCBtaW5QaXhlbFdpZHRoID0gKG1pbldpZHRoICogKGNlbGxTaXplLndpZHRoICsgc3BhY2luZykpIC0gc3BhY2luZ1xuICAgIGNvbnN0IG1heFBpeGVsV2lkdGggPSAobWF4V2lkdGggKiAoY2VsbFNpemUud2lkdGggKyBzcGFjaW5nKSkgLSBzcGFjaW5nXG4gICAgY29uc3QgbWluUGl4ZWxIZWlnaHQgPSAobWluSGVpZ2h0ICogKGNlbGxTaXplLmhlaWdodCArIHNwYWNpbmcpKSAtIHNwYWNpbmdcbiAgICBjb25zdCBtYXhQaXhlbEhlaWdodCA9IChtYXhIZWlnaHQgKiAoY2VsbFNpemUuaGVpZ2h0ICsgc3BhY2luZykpIC0gc3BhY2luZ1xuXG4gICAgc2xvdENvbnRhaW5lckVsPy5zdHlsZT8uc2V0UHJvcGVydHkoJy0tZG5kLWdyaWQtYm94LW9mZnNldC1sZWZ0JywgYCR7b2Zmc2V0UGl4ZWxzLnh9cHhgKVxuICAgIHNsb3RDb250YWluZXJFbD8uc3R5bGU/LnNldFByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtdG9wJywgYCR7b2Zmc2V0UGl4ZWxzLnl9cHhgKVxuICAgIHNsb3RDb250YWluZXJFbD8uc3R5bGU/LnNldFByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtd2lkdGgnLCBgJHtjbGFtcChvZmZzZXRQaXhlbHMudywgbWluUGl4ZWxXaWR0aCwgbWF4UGl4ZWxXaWR0aCl9cHhgKVxuICAgIHNsb3RDb250YWluZXJFbD8uc3R5bGU/LnNldFByb3BlcnR5KCctLWRuZC1ncmlkLWJveC1vZmZzZXQtaGVpZ2h0JywgYCR7Y2xhbXAob2Zmc2V0UGl4ZWxzLmgsIG1pblBpeGVsSGVpZ2h0LCBtYXhQaXhlbEhlaWdodCl9cHhgKVxuXG4gICAgc2xvdENvbnRhaW5lckVsPy5zY3JvbGxJbnRvVmlldyh7XG4gICAgICAgIGJlaGF2aW9yOiAnc21vb3RoJyxcbiAgICAgICAgYmxvY2s6ICduZWFyZXN0JyxcbiAgICAgICAgaW5saW5lOiAnbmVhcmVzdCdcbiAgICB9KVxuXG4gICAgY29uc3QgaGFsZkNlbGxTaXplV2lkdGggPSBjZWxsU2l6ZS53aWR0aCAvIDJcbiAgICBjb25zdCBoYWxmQ2VsbFNpemVIZWlnaHQgPSBjZWxsU2l6ZS5oZWlnaHQgLyAyXG4gICAgY29uc3QgdGFyZ2V0UG9zaXRpb24gPSBmcm9tUGl4ZWxzKHtcbiAgICAgICAgeDogb2Zmc2V0UGl4ZWxzLnggKyBoYWxmQ2VsbFNpemVXaWR0aCwgLy8gYWRkIGhhbGYgY2VsbHNpemUgZm9yIGJldHRlciBib3ggcGxhY2VtZW50XG4gICAgICAgIHk6IG9mZnNldFBpeGVscy55ICsgaGFsZkNlbGxTaXplSGVpZ2h0LFxuICAgICAgICB3OiBvZmZzZXRQaXhlbHMudyArIGhhbGZDZWxsU2l6ZVdpZHRoLFxuICAgICAgICBoOiBvZmZzZXRQaXhlbHMuaCArIGhhbGZDZWxsU2l6ZUhlaWdodFxuICAgIH0sIGNlbGxTaXplLndpZHRoLCBjZWxsU2l6ZS5oZWlnaHQsIGNlbGxTaXplLnNwYWNpbmcpXG5cbiAgICB0YXJnZXRQb3NpdGlvbi54ID0gTWF0aC5tYXgoMCwgdGFyZ2V0UG9zaXRpb24ueCArIGJhc2VQb3NpdGlvbi54KVxuICAgIHRhcmdldFBvc2l0aW9uLnkgPSBNYXRoLm1heCgwLCB0YXJnZXRQb3NpdGlvbi55ICsgYmFzZVBvc2l0aW9uLnkpXG4gICAgdGFyZ2V0UG9zaXRpb24udyA9IGNsYW1wKHRhcmdldFBvc2l0aW9uLncgKyBiYXNlUG9zaXRpb24udywgbWluV2lkdGgsIG1heFdpZHRoKVxuICAgIHRhcmdldFBvc2l0aW9uLmggPSBjbGFtcCh0YXJnZXRQb3NpdGlvbi5oICsgYmFzZVBvc2l0aW9uLmgsIG1pbkhlaWdodCwgbWF4SGVpZ2h0KVxuXG4gICAgdXBkYXRlUG9zaXRpb24odGFyZ2V0UG9zaXRpb24pXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVBvc2l0aW9uICh0YXJnZXRQb3NpdGlvbjogR3JpZFBvc2l0aW9uKSB7XG4gICAgY29uc3QgcG9zaXRpb24gPSBwb3NpdGlvblJlZi52YWx1ZVxuICAgIGlmIChcbiAgICAgICAgcG9zaXRpb24ueCAhPT0gdGFyZ2V0UG9zaXRpb24ueCB8fFxuICAgICAgICBwb3NpdGlvbi55ICE9PSB0YXJnZXRQb3NpdGlvbi55IHx8XG4gICAgICAgIHBvc2l0aW9uLncgIT09IHRhcmdldFBvc2l0aW9uLncgfHxcbiAgICAgICAgcG9zaXRpb24uaCAhPT0gdGFyZ2V0UG9zaXRpb24uaFxuICAgICkge1xuICAgICAgICB1cGRhdGVCb3goYm94UmVmLnZhbHVlLmlkLCB7IHBvc2l0aW9uOiB0YXJnZXRQb3NpdGlvbiB9KVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbWVyZ2VFdmVudHMgKC4uLmV2ZW50T2JqZWN0czogeyBba2V5OiBzdHJpbmddOiAoZXZlbnQ6IGFueSkgPT4gdm9pZCB9W10pIHtcbiAgICBjb25zdCBldmVudE1hcCA9IG5ldyBNYXA8c3RyaW5nLCAoKGV2ZW50OiBhbnkpID0+IHZvaWQpW10+KCk7XG4gICAgZXZlbnRPYmplY3RzLmZvckVhY2goZXZlbnRPYmplY3QgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBldmVudE9iamVjdCkge1xuICAgICAgICAgICAgY29uc3QgY2FsbGJhY2tMaXN0ID0gZXZlbnRNYXAuZ2V0KGtleSkgfHwgZXZlbnRNYXAuc2V0KGtleSwgW10pLmdldChrZXkpXG4gICAgICAgICAgICBjYWxsYmFja0xpc3QucHVzaChldmVudE9iamVjdFtrZXldKVxuICAgICAgICB9XG4gICAgfSlcbiAgICBjb25zdCBtZXJnZWRFdmVudHM6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fVxuICAgIGV2ZW50TWFwLmZvckVhY2goKGNhbGxiYWNrcywga2V5KSA9PiB7XG4gICAgICAgIG1lcmdlZEV2ZW50c1trZXldID0gKGV2dDogYW55KSA9PiBjYWxsYmFja3MuZm9yRWFjaChjYWxsYmFjayA9PiBjYWxsYmFjayhldnQpKVxuICAgIH0pXG4gICAgcmV0dXJuIG1lcmdlZEV2ZW50c1xufVxuXG5vblNjb3BlRGlzcG9zZSgoKSA9PiB7XG4gICAgb3ZlcmxheUVsLnJlbW92ZSgpXG59KVxuPC9zY3JpcHQ+XG5cbjx0ZW1wbGF0ZT5cbiAgICA8ZGl2XG4gICAgICAgIHYtaWY9XCJ2aXNpYmxlUmVmXCJcbiAgICAgICAgcmVmPVwiYm94RWxSZWZcIlxuICAgICAgICA6Y2xhc3M9XCJ7XG4gICAgICAgICAgICBkbmRncmlkX19ib3hfYm94OiB0cnVlLFxuICAgICAgICAgICAgZG5kZ3JpZF9fYm94X2RyYWdnaW5nOiBpc0RyYWdnaW5nUmVmLFxuICAgICAgICAgICAgZG5kZ3JpZF9fYm94X3Jlc2l6aW5nOiBpc1Jlc2l6aW5nUmVmXG4gICAgICAgIH1cIlxuICAgICAgICA6c3R5bGU9XCJjc3NQb3NpdGlvblJlZlwiXG4gICAgICAgIHYtb249XCJib3hFdmVudHNSZWZcIlxuICAgID5cbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgdi1pZj1cImlzRHJhZ2dpbmdSZWYgfHwgaXNSZXNpemluZ1JlZlwiXG4gICAgICAgICAgICBjbGFzcz1cImRuZGdyaWRfX2JveF9wbGFjZWhvbGRlckNvbnRhaW5lclwiXG4gICAgICAgID5cbiAgICAgICAgICAgIDxzbG90XG4gICAgICAgICAgICAgICAgbmFtZT1cInBsYWNlaG9sZGVyXCJcbiAgICAgICAgICAgICAgICB2LWJpbmQ9XCJib3hSZWZcIlxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJkbmRncmlkX19ib3hfcGxhY2Vob2xkZXJcIiAvPlxuICAgICAgICAgICAgPC9zbG90PlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdlxuICAgICAgICAgICAgcmVmPVwic2xvdENvbnRhaW5lckVsUmVmXCJcbiAgICAgICAgICAgIGNsYXNzPVwiZG5kZ3JpZF9fYm94X3Nsb3RDb250YWluZXJcIlxuICAgICAgICAgICAgOnN0eWxlPVwie1xuICAgICAgICAgICAgICAgICctLWRuZGdyaWRfX2JveF9vdmVyZmxvdyc6IHByb3BzLm92ZXJmbG93LFxuICAgICAgICAgICAgfVwiXG4gICAgICAgID5cbiAgICAgICAgICAgIDxzbG90IHYtYmluZD1cImJveFJlZlwiIC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2XG4gICAgICAgICAgICB2LWlmPVwiYWRkUmVzaXplSGFuZGxlc1JlZiAmJiBpc0JveFJlc2l6YWJsZVJlZlwiXG4gICAgICAgICAgICBjbGFzcz1cImRuZGdyaWRfX2JveF9yZXNpemVIYW5kbGVDb250YWluZXJcIlxuICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGRuZC1ncmlkLXJlc2l6ZT1cInQtXCIgLz5cbiAgICAgICAgICAgIDxkaXYgZG5kLWdyaWQtcmVzaXplPVwiLXJcIiAvPlxuICAgICAgICAgICAgPGRpdiBkbmQtZ3JpZC1yZXNpemU9XCJiLVwiIC8+XG4gICAgICAgICAgICA8ZGl2IGRuZC1ncmlkLXJlc2l6ZT1cIi1sXCIgLz5cbiAgICAgICAgICAgIDxkaXYgZG5kLWdyaWQtcmVzaXplPVwidGxcIiAvPlxuICAgICAgICAgICAgPGRpdiBkbmQtZ3JpZC1yZXNpemU9XCJ0clwiIC8+XG4gICAgICAgICAgICA8ZGl2IGRuZC1ncmlkLXJlc2l6ZT1cImJyXCIgLz5cbiAgICAgICAgICAgIDxkaXYgZG5kLWdyaWQtcmVzaXplPVwiYmxcIiAvPlxuICAgICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbjwvdGVtcGxhdGU+XG5cbjxzdHlsZT5cbjp3aGVyZSguZG5kZ3JpZF9fYm94X2JveCkge1xuICAgIGFsbDogdW5zZXQ7XG59XG5cbi5kbmRncmlkX19ib3hfYm94IHtcbiAgICBncmlkLWNvbHVtbjogdmFyKC0tZG5kLWdyaWQtYm94LXgpIC8gc3BhbiB2YXIoLS1kbmQtZ3JpZC1ib3gtd2lkdGgpO1xuICAgIGdyaWQtcm93OiB2YXIoLS1kbmQtZ3JpZC1ib3gteSkgLyBzcGFuIHZhcigtLWRuZC1ncmlkLWJveC1oZWlnaHQpO1xuICAgIGRpc3BsYXk6IGdyaWQ7XG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxMDAlO1xuICAgIGdyaWQtdGVtcGxhdGUtcm93czogMTAwJTtcbn1cblxuLmRuZGdyaWRfX2JveF9ib3ggPiAqIHtcbiAgICBncmlkLWNvbHVtbjogMTtcbiAgICBncmlkLXJvdzogMTtcbn1cbltkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSAuZG5kZ3JpZF9fYm94X2JveCB7XG4gICAgdXNlci1zZWxlY3Q6IG5vbmU7XG59XG5cbltkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSAuZG5kZ3JpZF9fYm94X2JveDpub3QoW2RuZC1ncmlkLW1vZGU9J2xheW91dCddIFtkbmQtZ3JpZC1tb2RlPSdncmlkJ10gLmRuZGdyaWRfX2JveF9ib3gpID4gOmlzKC5kbmRncmlkX19ib3hfc2xvdENvbnRhaW5lciwgLmRuZGdyaWRfX2JveF9wbGFjZWhvbGRlckNvbnRhaW5lcikge1xuICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICBsZWZ0OiB2YXIoLS1kbmRncmlkX19ib3hfYm94X2Nzc1BpeGVscy14KTtcbiAgICB0b3A6IHZhcigtLWRuZGdyaWRfX2JveF9ib3hfY3NzUGl4ZWxzLXkpO1xuICAgIHdpZHRoOiB2YXIoLS1kbmRncmlkX19ib3hfYm94X2Nzc1BpeGVscy13KTtcbiAgICBoZWlnaHQ6IHZhcigtLWRuZGdyaWRfX2JveF9ib3hfY3NzUGl4ZWxzLWgpO1xufVxuXG5bZG5kLWdyaWQtbW9kZT0nbGF5b3V0J10gLmRuZGdyaWRfX2JveF9ib3g6aXMoLmRuZGdyaWRfX2JveF9kcmFnZ2luZywgLmRuZGdyaWRfX2JveF9yZXNpemluZyk6bm90KFtkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSBbZG5kLWdyaWQtbW9kZT0nZ3JpZCddIC5kbmRncmlkX19ib3hfYm94KSAgPiAuZG5kZ3JpZF9fYm94X3Nsb3RDb250YWluZXIge1xuICAgIGxlZnQ6IGNhbGModmFyKC0tZG5kZ3JpZF9fYm94X2JveF9iYXNlQ3NzUGl4ZWxzLXgpICsgdmFyKC0tZG5kLWdyaWQtYm94LW9mZnNldC1sZWZ0LCAwcHgpKTtcbiAgICB0b3A6IGNhbGModmFyKC0tZG5kZ3JpZF9fYm94X2JveF9iYXNlQ3NzUGl4ZWxzLXkpICsgdmFyKC0tZG5kLWdyaWQtYm94LW9mZnNldC10b3AsIDBweCkpO1xuICAgIHdpZHRoOiBjYWxjKHZhcigtLWRuZGdyaWRfX2JveF9ib3hfYmFzZUNzc1BpeGVscy13KSArIHZhcigtLWRuZC1ncmlkLWJveC1vZmZzZXQtd2lkdGgsIDBweCkpO1xuICAgIGhlaWdodDogY2FsYyh2YXIoLS1kbmRncmlkX19ib3hfYm94X2Jhc2VDc3NQaXhlbHMtaCkgKyB2YXIoLS1kbmQtZ3JpZC1ib3gtb2Zmc2V0LWhlaWdodCwgMHB4KSk7XG59XG5cbi5kbmRncmlkX19ib3hfcGxhY2Vob2xkZXIge1xuICAgIHdpZHRoOiAxMDAlO1xuICAgIGhlaWdodDogMTAwJTtcbiAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xuICAgIGJhY2tncm91bmQ6IHZhcigtLWRuZC1ncmlkLXBsYWNlaG9sZGVyLWJhY2tncm91bmQsICNGMDAyKTtcbiAgICBib3JkZXI6IHZhcigtLWRuZC1ncmlkLXBsYWNlaG9sZGVyLWJvcmRlciwgbm9uZSk7XG59XG5cbltkbmQtZ3JpZC1tb2RlPSdsYXlvdXQnXSAuZG5kZ3JpZF9fYm94X2JveDppcyguZG5kZ3JpZF9fYm94X2RyYWdnaW5nLCAuZG5kZ3JpZF9fYm94X3Jlc2l6aW5nKTpub3QoW2RuZC1ncmlkLW1vZGU9J2xheW91dCddIFtkbmQtZ3JpZC1tb2RlPSdncmlkJ10gLmRuZGdyaWRfX2JveF9ib3gpID4gLmRuZGdyaWRfX2JveF9zbG90Q29udGFpbmVyIHtcbiAgICB6LWluZGV4OiA5OTk5O1xuICAgIG9wYWNpdHk6IDAuNjtcbn1cblxuW2RuZC1ncmlkLW1vZGU9J2xheW91dCddIC5kbmRncmlkX19ib3hfYm94Om5vdCguZG5kZ3JpZF9fYm94X2RyYWdnaW5nLCAuZG5kZ3JpZF9fYm94X3Jlc2l6aW5nKTpub3QoW2RuZC1ncmlkLW1vZGU9J2xheW91dCddIFtkbmQtZ3JpZC1tb2RlPSdncmlkJ10gLmRuZGdyaWRfX2JveF9ib3gpID4gLmRuZGdyaWRfX2JveF9zbG90Q29udGFpbmVyLFxuLmRuZGdyaWRfX2JveF9wbGFjZWhvbGRlckNvbnRhaW5lciB7XG4gICAgdHJhbnNpdGlvbi1wcm9wZXJ0eTogbGVmdCwgdG9wLCB3aWR0aCwgaGVpZ2h0O1xuICAgIHRyYW5zaXRpb24tZHVyYXRpb246IHZhcigtLWRuZC1ncmlkLXRyYW5zaXRpb24tZHVyYXRpb24sIDAuMXMpO1xuICAgIHRyYW5zaXRpb24tdGltaW5nLWZ1bmN0aW9uOiB2YXIoLS1kbmQtZ3JpZC10cmFuc2l0aW9uLXRpbWluZy1mdW5jdGlvbiwgZWFzZS1vdXQpO1xufVxuXG4uZG5kZ3JpZF9fYm94X3Nsb3RDb250YWluZXIge1xuICAgIHotaW5kZXg6IDE7XG4gICAgb3ZlcmZsb3c6IHZhcigtLWRuZGdyaWRfX2JveF9vdmVyZmxvdyk7XG59XG5cbi5kbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBoZWlnaHQ6IDEwMCU7XG4gICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgIC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1zaXplOiAxMHB4O1xuICAgIC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1vZmZzZXQ6IGNhbGModmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItc2l6ZSwgdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1zaXplKSkgLyAtMik7XG59XG5cbi5kbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyID4gKiB7XG4gICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgIHdpZHRoOiB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1zaXplLCB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1kZWZhdWx0LXNpemUpKTtcbiAgICBoZWlnaHQ6IHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLXNpemUsIHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLWRlZmF1bHQtc2l6ZSkpO1xuICAgIHotaW5kZXg6IDk5OTk7XG59XG5cbi5kbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyID4gW2RuZC1ncmlkLXJlc2l6ZV49dF0ge1xuICAgIHRvcDogdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItb2Zmc2V0LCB2YXIoLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1kZWZhdWx0LW9mZnNldCkpO1xufVxuXG4uZG5kZ3JpZF9fYm94X3Jlc2l6ZUhhbmRsZUNvbnRhaW5lciA+IFtkbmQtZ3JpZC1yZXNpemVePWJdIHtcbiAgICBib3R0b206IHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLW9mZnNldCwgdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1vZmZzZXQpKTtcbn1cblxuLmRuZGdyaWRfX2JveF9yZXNpemVIYW5kbGVDb250YWluZXIgPiBbZG5kLWdyaWQtcmVzaXplXj0nLSddIHtcbiAgICB0b3A6IDBweDtcbiAgICBoZWlnaHQ6IDEwMCU7XG59XG5cbi5kbmRncmlkX19ib3hfcmVzaXplSGFuZGxlQ29udGFpbmVyID4gW2RuZC1ncmlkLXJlc2l6ZSQ9bF0ge1xuICAgIGxlZnQ6IHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLW9mZnNldCwgdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1vZmZzZXQpKTtcbn1cblxuLmRuZGdyaWRfX2JveF9yZXNpemVIYW5kbGVDb250YWluZXIgPiBbZG5kLWdyaWQtcmVzaXplJD1yXSB7XG4gICAgcmlnaHQ6IHZhcigtLWRuZC1ncmlkLXJlc2l6ZS1oYW5kbGVyLW9mZnNldCwgdmFyKC0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItZGVmYXVsdC1vZmZzZXQpKTtcbn1cblxuLmRuZGdyaWRfX2JveF9yZXNpemVIYW5kbGVDb250YWluZXIgPiBbZG5kLWdyaWQtcmVzaXplJD0nLSddIHtcbiAgICBsZWZ0OiAwcHg7XG4gICAgd2lkdGg6IDEwMCU7XG59XG5cbi5kbmRncmlkX19ib3hfb3ZlcmxheSB7XG4gICAgcG9zaXRpb246IGZpeGVkO1xuICAgIHRvcDogMDtcbiAgICBsZWZ0OiAwO1xuICAgIHdpZHRoOiAxMDB2dztcbiAgICBoZWlnaHQ6IDEwMHZoO1xuICAgIHotaW5kZXg6IDk5OTk5OTtcbn1cbjwvc3R5bGU+XG4iLCI8c2NyaXB0IGxhbmc9XCJ0c1wiPlxuZXhwb3J0IGRlZmF1bHQge1xuICAgIGluaGVyaXRBdHRyczogdHJ1ZVxufVxuXG5sZXQgTkVYVF9ETkRfR1JJRF9JRCA9IDFcbjwvc2NyaXB0PlxuXG48c2NyaXB0IHNldHVwIGxhbmc9XCJ0c1wiPlxuaW1wb3J0IHsgcHJvdmlkZSwgcmVhZG9ubHksIHdhdGNoLCBvbk1vdW50ZWQsIG9uQmVmb3JlVW5tb3VudCwgdG9SZWYsIHNoYWxsb3dSZWYsIGNvbXB1dGVkLCBQcm9wLCBSZWYgfSBmcm9tICd2dWUnXG5pbXBvcnQgeyBDb250YWluZXJTeW1ib2wgfSBmcm9tICcuLi9zeW1ib2xzJ1xuaW1wb3J0IHsgTGF5b3V0LCBMYXlvdXRFbGVtZW50LCBnZXRCb3ggYXMgX2dldEJveCwgdXBkYXRlQm94IGFzIF91cGRhdGVCb3ggfSBmcm9tICcuLi90b29scy9sYXlvdXQnXG5cbnR5cGUgU2VsZWN0b3JQcm9wID0ge1xuICAgIGluY2x1ZGU6IHN0cmluZztcbiAgICBleGNsdWRlPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBwcm9wcyA9IGRlZmluZVByb3BzKHtcbiAgICBsYXlvdXQ6IHtcbiAgICAgICAgdHlwZTogQXJyYXksXG4gICAgICAgIGRlZmF1bHQ6ICgpID0+IFtdXG4gICAgfSBhcyBQcm9wPExheW91dD4sXG5cbiAgICBidWJibGVVcDoge1xuICAgICAgICB0eXBlOiBbQm9vbGVhbiwgU3RyaW5nXSxcbiAgICAgICAgZGVmYXVsdDogZmFsc2VcbiAgICB9IGFzIFByb3A8Ym9vbGVhbiB8IFwianVtcC1vdmVyXCI+LFxuXG4gICAgZGlzYWJsZWQ6IHtcbiAgICAgICAgdHlwZTogQm9vbGVhbixcbiAgICAgICAgZGVmYXVsdDogZmFsc2VcbiAgICB9LFxuXG4gICAgaXNSZXNpemFibGU6IHtcbiAgICAgICAgdHlwZTogQm9vbGVhbixcbiAgICAgICAgZGVmYXVsdDogdHJ1ZSxcbiAgICB9LFxuXG4gICAgaXNEcmFnZ2FibGU6IHtcbiAgICAgICAgdHlwZTogQm9vbGVhbixcbiAgICAgICAgZGVmYXVsdDogdHJ1ZVxuICAgIH0sXG5cbiAgICBkcmFnU2VsZWN0b3I6IHtcbiAgICAgICAgdHlwZTogT2JqZWN0LFxuICAgICAgICBkZWZhdWx0OiAoKSA9PiAoe1xuICAgICAgICAgICAgaW5jbHVkZTogJ1tkbmQtZ3JpZC1kcmFnXScsXG4gICAgICAgICAgICBleGNsdWRlOiAnOmlzKGlucHV0LCBidXR0b24sIHNlbGVjdCwgYVtocmVmXSknXG4gICAgICAgIH0pXG4gICAgfSBhcyBQcm9wPFNlbGVjdG9yUHJvcD4sXG5cbiAgICByZXNpemVTZWxlY3Rvcjoge1xuICAgICAgICB0eXBlOiBPYmplY3QsXG4gICAgICAgIGRlZmF1bHQ6ICgpID0+ICh7XG4gICAgICAgICAgICBpbmNsdWRlOiAnW2RuZC1ncmlkLXJlc2l6ZV0nLFxuICAgICAgICAgICAgZXhjbHVkZTogJzppcyhpbnB1dCwgYnV0dG9uLCBzZWxlY3QsIGFbaHJlZl0pJ1xuICAgICAgICB9KVxuICAgIH0gYXMgUHJvcDxTZWxlY3RvclByb3A+LFxuXG4gICAgYWRkUmVzaXplSGFuZGxlczoge1xuICAgICAgICB0eXBlOiBCb29sZWFuLFxuICAgICAgICBkZWZhdWx0OiB0cnVlXG4gICAgfSxcblxuICAgIC8vIHN0eWxpbmcgKG1hcHBlZCB0byBjc3MgcHJvcHMpXG4gICAgY2VsbFdpZHRoOiB7XG4gICAgICAgIHR5cGU6IFtOdW1iZXIsIFN0cmluZ10sXG4gICAgICAgIGRlZmF1bHQ6IG51bGxcbiAgICB9LFxuXG4gICAgY2VsbE1heFdpZHRoOiB7XG4gICAgICAgIHR5cGU6IFtOdW1iZXIsIFN0cmluZ10sXG4gICAgICAgIGRlZmF1bHQ6IG51bGxcbiAgICB9LFxuXG4gICAgY2VsbEhlaWdodDoge1xuICAgICAgICB0eXBlOiBbTnVtYmVyLCBTdHJpbmddLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIGNlbGxNYXhIZWlnaHQ6IHtcbiAgICAgICAgdHlwZTogW051bWJlciwgU3RyaW5nXSxcbiAgICAgICAgZGVmYXVsdDogbnVsbFxuICAgIH0sXG5cbiAgICBjZWxsU3BhY2luZzoge1xuICAgICAgICB0eXBlOiBbTnVtYmVyLCBTdHJpbmddLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIHJlc2l6ZUhhbmRsZXJTaXplOiB7XG4gICAgICAgIHR5cGU6IFtOdW1iZXIsIFN0cmluZ10sXG4gICAgICAgIGRlZmF1bHQ6IG51bGxcbiAgICB9LFxuXG4gICAgcmVzaXplSGFuZGxlck9mZnNldDoge1xuICAgICAgICB0eXBlOiBbTnVtYmVyLCBTdHJpbmddLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIHBsYWNlaG9sZGVyQmFja2dyb3VuZDoge1xuICAgICAgICB0eXBlOiBTdHJpbmcsXG4gICAgICAgIGRlZmF1bHQ6IG51bGxcbiAgICB9LFxuXG4gICAgcGxhY2Vob2xkZXJCb3JkZXI6IHtcbiAgICAgICAgdHlwZTogU3RyaW5nLFxuICAgICAgICBkZWZhdWx0OiBudWxsXG4gICAgfSxcblxuICAgIHRyYW5zaXRpb25UaW1pbmdGdW5jdGlvbjoge1xuICAgICAgICB0eXBlOiBTdHJpbmcsXG4gICAgICAgIGRlZmF1bHQ6IG51bGxcbiAgICB9LFxuXG4gICAgdHJhbnNpdGlvbkR1cmF0aW9uOiB7XG4gICAgICAgIHR5cGU6IFN0cmluZyxcbiAgICAgICAgZGVmYXVsdDogbnVsbFxuICAgIH1cbn0pXG5cbmNvbnN0IERORF9HUklEX0lEID0gTkVYVF9ETkRfR1JJRF9JRCsrXG5cbmNvbnN0IGVtaXQgPSBkZWZpbmVFbWl0cyhbJ3VwZGF0ZTpsYXlvdXQnXSlcblxuY29uc3QgY29udGFpbmVyRWxSZWYgPSBzaGFsbG93UmVmKClcbmNvbnN0IGNvbXB1dGVkQ2VsbFNpemVSZWYgPSBzaGFsbG93UmVmKClcbmNvbnN0IG1vZGVSZWYgPSBzaGFsbG93UmVmKCdncmlkJylcbmNvbnN0IGxheW91dFJlZiA9IHNoYWxsb3dSZWYocHJvcHMubGF5b3V0ISlcbmNvbnN0IGlzUmVzaXphYmxlID0gY29tcHV0ZWQoKCkgPT4gcHJvcHMuaXNSZXNpemFibGUpO1xuY29uc3QgaXNEcmFnZ2FibGUgPSBjb21wdXRlZCgoKSA9PiBwcm9wcy5pc1Jlc2l6YWJsZSk7XG5jb25zdCBhZGRSZXNpemVIYW5kbGVzID0gY29tcHV0ZWQoKCkgPT4gcHJvcHMuYWRkUmVzaXplSGFuZGxlcyk7XG5jb25zdCBkaXNhYmxlZCA9IGNvbXB1dGVkKCgpID0+IHByb3BzLmRpc2FibGVkISk7XG5cbnByb3ZpZGUoQ29udGFpbmVyU3ltYm9sLCB7XG4gICAgbGF5b3V0OiByZWFkb25seShsYXlvdXRSZWYpLFxuICAgIG1vZGU6IHJlYWRvbmx5KG1vZGVSZWYpLFxuICAgIGRpc2FibGVkLFxuICAgIGlzUmVzaXphYmxlLFxuICAgIGlzRHJhZ2dhYmxlLFxuICAgIGNvbXB1dGVkQ2VsbFNpemU6IHJlYWRvbmx5KGNvbXB1dGVkQ2VsbFNpemVSZWYpLFxuICAgIHN0YXJ0TGF5b3V0LFxuICAgIHN0b3BMYXlvdXQsXG4gICAgZ2V0Qm94LFxuICAgIHVwZGF0ZUJveCxcbiAgICBjYW5TdGFydERyYWcsXG4gICAgY2FuU3RhcnRSZXNpemUsXG4gICAgYWRkUmVzaXplSGFuZGxlcyxcbn0pXG5cbndhdGNoKCgpID0+IHByb3BzLmxheW91dCEsIG5ld0xheW91dCA9PiB7XG4gICAgbGF5b3V0UmVmLnZhbHVlID0gbmV3TGF5b3V0XG59KVxuXG5jb25zdCBsYXlvdXRPcHRpb25zUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIHJldHVybiB7XG4gICAgICAgIGJ1YmJsZVVwOiBwcm9wcy5idWJibGVVcCFcbiAgICB9XG59KVxuXG5jb25zdCBkcmFnU2VsZWN0b3JzUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIHJldHVybiBnZXRTZWxlY3RvcnNGcm9tUHJvcChwcm9wcy5kcmFnU2VsZWN0b3IhKVxufSlcblxuY29uc3QgcmVzaXplU2VsZWN0b3JzUmVmID0gY29tcHV0ZWQoKCkgPT4ge1xuICAgIHJldHVybiBnZXRTZWxlY3RvcnNGcm9tUHJvcChwcm9wcy5yZXNpemVTZWxlY3RvciEpXG59KVxuXG5jb25zdCBjdXJzb3JTdHlsZUNvbnRlbnRSZWYgPSBjb21wdXRlZCgoKSA9PiB7XG4gICAgaWYgKHByb3BzLmRpc2FibGVkKSB7XG4gICAgICAgIHJldHVybiAnJ1xuICAgIH1cblxuICAgIGNvbnN0IHN0eWxlQ29udGVudDogc3RyaW5nW10gPSBbXVxuXG4gICAgc3R5bGVDb250ZW50LnB1c2goXG4gICAgICAgIC4uLltcbiAgICAgICAgICAgIFsnJywgJ2N1cnNvcjogdmFyKC0tZG5kLXJlc2l6ZS1jdXJzb3ItbndzZSwgbndzZS1yZXNpemUpOyddLFxuICAgICAgICAgICAgWyc6d2hlcmUoW2RuZC1ncmlkLXJlc2l6ZT10LV0sIFtkbmQtZ3JpZC1yZXNpemU9Yi1dKScsICdjdXJzb3I6IHZhcigtLWRuZC1yZXNpemUtY3Vyc29yLW5zLCBucy1yZXNpemUpOyddLFxuICAgICAgICAgICAgWyc6d2hlcmUoW2RuZC1ncmlkLXJlc2l6ZT0tcl0sIFtkbmQtZ3JpZC1yZXNpemU9LWxdKScsICdjdXJzb3I6IHZhcigtLWRuZC1yZXNpemUtY3Vyc29yLWV3LCBldy1yZXNpemUpOyddLFxuICAgICAgICAgICAgWyc6d2hlcmUoW2RuZC1ncmlkLXJlc2l6ZT10bF0sIFtkbmQtZ3JpZC1yZXNpemU9YnJdKScsICdjdXJzb3I6IHZhcigtLWRuZC1yZXNpemUtY3Vyc29yLW53c2UsIG53c2UtcmVzaXplKTsnXSxcbiAgICAgICAgICAgIFsnOndoZXJlKFtkbmQtZ3JpZC1yZXNpemU9dHJdLCBbZG5kLWdyaWQtcmVzaXplPWJsXSknLCAnY3Vyc29yOiB2YXIoLS1kbmQtcmVzaXplLWN1cnNvci1uZXN3LCBuZXN3LXJlc2l6ZSk7J11cbiAgICAgICAgXS5tYXAoKFtzZWxlY3RvciwgcnVsZXNdKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3RvcnMgPSBnZXRTZWxlY3RvcnNGcm9tUHJvcChwcm9wcy5yZXNpemVTZWxlY3RvciEsIHNlbGVjdG9yKVxuICAgICAgICAgICAgcmV0dXJuIGBcbiAgICAgICAgICAgICAgICAuZG5kZ3JpZF9fYm94X2NvbnRhaW5lcltkbmQtZ3JpZC1pZD1cIiR7RE5EX0dSSURfSUR9XCJdIDpub3QoJGRuZGdyaWRfX2JveF9jb250YWluZXIpICR7c2VsZWN0b3JzLmpvaW4oJywgJyl9IHtcbiAgICAgICAgICAgICAgICAgICAgJHtydWxlc31cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBgXG4gICAgICAgIH0pLFxuICAgICAgICAuLi5bXG4gICAgICAgICAgICBbJycsICdjdXJzb3I6IHZhcigtLWRuZC1kcmFnLWN1cnNvciwgbW92ZSk7J11cbiAgICAgICAgXS5tYXAoKFtzZWxlY3RvciwgcnVsZXNdKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZWxlY3RvcnMgPSBnZXRTZWxlY3RvcnNGcm9tUHJvcChwcm9wcy5kcmFnU2VsZWN0b3IhLCBzZWxlY3RvcilcbiAgICAgICAgICAgIHJldHVybiBgXG4gICAgICAgICAgICAgICAgLmRuZGdyaWRfX2JveF9jb250YWluZXJbZG5kLWdyaWQtaWQ9XCIke0RORF9HUklEX0lEfVwiXSA6bm90KC5kbmRncmlkX19ib3hfY29udGFpbmVyKSAke3NlbGVjdG9ycy5qb2luKCcsICcpfSB7XG4gICAgICAgICAgICAgICAgICAgICR7cnVsZXN9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgYFxuICAgICAgICB9KVxuICAgIClcblxuICAgIHJldHVybiBzdHlsZUNvbnRlbnQuam9pbignXFxuJylcbn0pXG5cbmNvbnN0IGN1cnNvclN0eWxlU2hlZXQgPSBuZXcgQ1NTU3R5bGVTaGVldCgpXG53YXRjaChjdXJzb3JTdHlsZUNvbnRlbnRSZWYsIGNvbnRlbnQgPT4ge1xuICAgIGN1cnNvclN0eWxlU2hlZXQucmVwbGFjZVN5bmMoY29udGVudClcbn0sIHtcbiAgICBpbW1lZGlhdGU6IHRydWVcbn0pXG5cbm9uTW91bnRlZCgoKSA9PiB7XG4gICAgZG9jdW1lbnQuYWRvcHRlZFN0eWxlU2hlZXRzID0gWyAuLi5kb2N1bWVudC5hZG9wdGVkU3R5bGVTaGVldHMsIGN1cnNvclN0eWxlU2hlZXQgXVxufSlcblxub25CZWZvcmVVbm1vdW50KCgpID0+IHtcbiAgICBjb25zdCBpbmRleCA9IGRvY3VtZW50LmFkb3B0ZWRTdHlsZVNoZWV0cy5pbmRleE9mKGN1cnNvclN0eWxlU2hlZXQpXG4gICAgaWYgKGluZGV4ID4gLTEpIHtcbiAgICAgICAgZG9jdW1lbnQuYWRvcHRlZFN0eWxlU2hlZXRzID0gW1xuICAgICAgICAgICAgLi4uZG9jdW1lbnQuYWRvcHRlZFN0eWxlU2hlZXRzLnNsaWNlKDAsIGluZGV4KSxcbiAgICAgICAgICAgIC4uLmRvY3VtZW50LmFkb3B0ZWRTdHlsZVNoZWV0cy5zbGljZShpbmRleCsxKSxcbiAgICAgICAgXVxuICAgIH1cbn0pXG5cbmZ1bmN0aW9uIGdldEJveCAoaWQ6IGFueSkge1xuICAgIC8vIFRPRE8gcmVzb2x2ZSBleHRyYSBwYXJhbWV0ZXJcbiAgICAvL3JldHVybiBfZ2V0Qm94KGxheW91dFJlZi52YWx1ZSwgaWQsIGxheW91dE9wdGlvbnNSZWYudmFsdWUpXG4gICAgcmV0dXJuIF9nZXRCb3gobGF5b3V0UmVmLnZhbHVlLCBpZClcbn1cblxuZnVuY3Rpb24gdXBkYXRlQm94IChpZDogYW55LCBkYXRhOiBQYXJ0aWFsPExheW91dEVsZW1lbnQ+KSB7XG4gICAgcmV0dXJuIGxheW91dFJlZi52YWx1ZSA9IF91cGRhdGVCb3gocHJvcHMubGF5b3V0ISwgaWQsIGRhdGEsIGxheW91dE9wdGlvbnNSZWYudmFsdWUpXG59XG5cbmZ1bmN0aW9uIHRvQ3NzU2l6ZSAodmFsdWU6IHN0cmluZyB8IG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQpIHtcbiAgICBpZiAodmFsdWUgPT0gdW5kZWZpbmVkKSByZXR1cm5cbiAgICByZXR1cm4gaXNOYU4odmFsdWUgYXMgbnVtYmVyKSA/IHZhbHVlIDogYCR7dmFsdWV9cHhgXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUNvbXB1dGVkQ2VsbFNpemUgKCkge1xuICAgIGlmIChjb250YWluZXJFbFJlZi52YWx1ZSkge1xuICAgICAgICBjb25zdCBzdHlsZSA9IGdldENvbXB1dGVkU3R5bGUoY29udGFpbmVyRWxSZWYudmFsdWUpXG4gICAgICAgIGNvbnN0IHdpZHRoID0gcGFyc2VGbG9hdChzdHlsZS5ncmlkVGVtcGxhdGVDb2x1bW5zKVxuICAgICAgICBjb25zdCBoZWlnaHQgPSBwYXJzZUZsb2F0KHN0eWxlLmdyaWRUZW1wbGF0ZVJvd3MpXG4gICAgICAgIGNvbnN0IHNwYWNpbmcgPSBwYXJzZUZsb2F0KHN0eWxlLmdhcClcblxuICAgICAgICBjb21wdXRlZENlbGxTaXplUmVmLnZhbHVlID0geyB3aWR0aCwgaGVpZ2h0LCBzcGFjaW5nIH1cbiAgICB9XG4gICAgcmV0dXJuIGNvbXB1dGVkQ2VsbFNpemVSZWYudmFsdWVcbn1cblxuZnVuY3Rpb24gc3RhcnRMYXlvdXQgKCkge1xuICAgIHVwZGF0ZUNvbXB1dGVkQ2VsbFNpemUoKVxuICAgIG1vZGVSZWYudmFsdWUgPSAnbGF5b3V0J1xufVxuXG5mdW5jdGlvbiBzdG9wTGF5b3V0ICgpIHtcbiAgICBlbWl0KCd1cGRhdGU6bGF5b3V0JywgbGF5b3V0UmVmLnZhbHVlKVxuICAgIG1vZGVSZWYudmFsdWUgPSAnZ3JpZCdcbn1cblxuZnVuY3Rpb24gY2FuU3RhcnREcmFnIChldnQ6IE1vdXNlRXZlbnQgfCBUb3VjaEV2ZW50KSB7XG4gICAgcmV0dXJuIEJvb2xlYW4oZXZ0LnRhcmdldCAmJiBkcmFnU2VsZWN0b3JzUmVmLnZhbHVlLmZpbmQoc2VsZWN0b3IgPT4gKGV2dC50YXJnZXQgYXMgRWxlbWVudCkubWF0Y2hlcyhzZWxlY3RvcikpKVxufVxuXG5mdW5jdGlvbiBjYW5TdGFydFJlc2l6ZSAoZXZ0OiBNb3VzZUV2ZW50IHwgVG91Y2hFdmVudCkge1xuICAgIHJldHVybiBCb29sZWFuKGV2dC50YXJnZXQgJiYgcmVzaXplU2VsZWN0b3JzUmVmLnZhbHVlLmZpbmQoc2VsZWN0b3IgPT4gKGV2dC50YXJnZXQgYXMgRWxlbWVudCkubWF0Y2hlcyhzZWxlY3RvcikpKVxufVxuXG5mdW5jdGlvbiBnZXRTZWxlY3RvcnNGcm9tUHJvcCAocHJvcDogU2VsZWN0b3JQcm9wLCBhZGRpdGlvbmFsU2VsZWN0b3I/OiBzdHJpbmcpIHtcbiAgICBsZXQgc2VsZWN0b3JzID0gW1xuICAgICAgICAocHJvcC5pbmNsdWRlIHx8ICcqJykgKyAoYWRkaXRpb25hbFNlbGVjdG9yIHx8ICcnKSxcbiAgICAgICAgKHByb3AuaW5jbHVkZSB8fCAnKicpICsgKGFkZGl0aW9uYWxTZWxlY3RvciB8fCAnJykgKyAnIConXG4gICAgXVxuICAgIGlmIChwcm9wLmV4Y2x1ZGUpIHtcbiAgICAgICAgc2VsZWN0b3JzID0gc2VsZWN0b3JzLm1hcChzZWxlY3RvciA9PiBgJHtzZWxlY3Rvcn06bm90KCR7cHJvcC5leGNsdWRlfSwgJHtwcm9wLmV4Y2x1ZGV9ICopYClcbiAgICB9XG5cbiAgICByZXR1cm4gc2VsZWN0b3JzXG59XG48L3NjcmlwdD5cblxuPHRlbXBsYXRlPlxuICAgIDxkaXZcbiAgICAgICAgcmVmPVwiY29udGFpbmVyRWxSZWZcIlxuICAgICAgICA6ZG5kLWdyaWQtaWQ9XCJETkRfR1JJRF9JRFwiXG4gICAgICAgIDpkbmQtZ3JpZC1tb2RlPVwibW9kZVJlZlwiXG4gICAgICAgIGNsYXNzPVwiZG5kZ3JpZF9fYm94X2NvbnRhaW5lclwiXG4gICAgICAgIDpzdHlsZT1cIntcbiAgICAgICAgICAgICctLWRuZC1ncmlkLWNlbGwtd2lkdGgnOiB0b0Nzc1NpemUocHJvcHMuY2VsbFdpZHRoKSxcbiAgICAgICAgICAgICctLWRuZC1ncmlkLWNlbGwtbWF4LXdpZHRoJzogdG9Dc3NTaXplKHByb3BzLmNlbGxNYXhXaWR0aCkgPz8gMCxcbiAgICAgICAgICAgICctLWRuZC1ncmlkLWNlbGwtaGVpZ2h0JzogdG9Dc3NTaXplKHByb3BzLmNlbGxIZWlnaHQpLFxuICAgICAgICAgICAgJy0tZG5kLWdyaWQtY2VsbC1tYXgtaGVpZ2h0JzogdG9Dc3NTaXplKHByb3BzLmNlbGxNYXhIZWlnaHQpID8/IDAsXG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC1jZWxsLXNwYWNpbmcnOiB0b0Nzc1NpemUocHJvcHMuY2VsbFNwYWNpbmcpLFxuICAgICAgICAgICAgJy0tZG5kLWdyaWQtcmVzaXplLWhhbmRsZXItc2l6ZSc6IHRvQ3NzU2l6ZShwcm9wcy5yZXNpemVIYW5kbGVyU2l6ZSksXG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC1yZXNpemUtaGFuZGxlci1vZmZzZXQnOiB0b0Nzc1NpemUocHJvcHMucmVzaXplSGFuZGxlck9mZnNldCksXG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC1wbGFjZWhvbGRlci1iYWNrZ3JvdW5kJzogcHJvcHMucGxhY2Vob2xkZXJCYWNrZ3JvdW5kLFxuICAgICAgICAgICAgJy0tZG5kLWdyaWQtcGxhY2Vob2xkZXItYm9yZGVyJzogcHJvcHMucGxhY2Vob2xkZXJCb3JkZXIsXG4gICAgICAgICAgICAnLS1kbmQtZ3JpZC10cmFuc2l0aW9uLXRpbWluZy1mdW5jdGlvbic6IHByb3BzLnRyYW5zaXRpb25UaW1pbmdGdW5jdGlvbixcbiAgICAgICAgICAgICctLWRuZC1ncmlkLXRyYW5zaXRpb24tZHVyYXRpb24nOiBwcm9wcy50cmFuc2l0aW9uRHVyYXRpb24sXG4gICAgICAgIH1cIlxuICAgID5cbiAgICAgICAgPHNsb3QgLz5cbiAgICA8L2Rpdj5cbjwvdGVtcGxhdGU+XG5cbjxzdHlsZT5cbjp3aGVyZSguZG5kZ3JpZF9fYm94X2NvbnRhaW5lcikge1xuICAgIGFsbDogdW5zZXQ7XG59XG5cbi5kbmRncmlkX19ib3hfY29udGFpbmVyIHtcbiAgICBkaXNwbGF5OiBncmlkO1xuICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgICBncmlkLWF1dG8tY29sdW1uczogbWlubWF4KFxuICAgICAgICB2YXIoLS1kbmQtZ3JpZC1jZWxsLXdpZHRoLCA4ZW0pLFxuICAgICAgICB2YXIoLS1kbmQtZ3JpZC1jZWxsLW1heC13aWR0aCwgMClcbiAgICApO1xuICAgIGdyaWQtYXV0by1yb3dzOiBtaW5tYXgoXG4gICAgICAgIHZhcigtLWRuZC1ncmlkLWNlbGwtaGVpZ2h0LCA4ZW0pLFxuICAgICAgICB2YXIoLS1kbmQtZ3JpZC1jZWxsLW1heC1oZWlnaHQsIDApXG4gICAgKTtcbiAgICBnYXA6IHZhcigtLWRuZC1ncmlkLWNlbGwtc3BhY2luZywgMC41ZW0pO1xuICAgIG1pbi13aWR0aDogbWluLWNvbnRlbnQ7XG4gICAgbWluLWhlaWdodDogbWluLWNvbnRlbnQ7XG59XG48L3N0eWxlPlxuIl0sIm5hbWVzIjpbIm9uU2NvcGVEaXNwb3NlIiwiX19kZWZhdWx0X18iLCJpbmplY3QiLCJzaGFsbG93UmVmIiwiY29tcHV0ZWQiLCJ1c2VEbmRIYW5kbGVyIiwiYmFzZVBvc2l0aW9uIiwicHJvdmlkZSIsInJlYWRvbmx5IiwiZ2V0Qm94IiwidXBkYXRlQm94Iiwid2F0Y2giLCJvbk1vdW50ZWQiLCJvbkJlZm9yZVVubW91bnQiLCJfZ2V0Qm94IiwiX3VwZGF0ZUJveCJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0lBeUJhLE1BQUEsZUFBQSxHQUFrQixPQUFPLGtCQUFrQixDQUFBOztJQ3NDakQsU0FBUyxLQUFNLE1BQWdCLEVBQUE7SUFDbEMsRUFBQSxPQUFPLENBQUMsR0FBRyxNQUFNLEVBQUUsSUFBSyxDQUFBLENBQUMsR0FBRyxDQUFNLEtBQUE7SUFDOUIsSUFBQSxJQUFJLENBQUUsQ0FBQSxNQUFBLElBQVUsQ0FBQyxDQUFBLENBQUUsTUFBUSxFQUFBO0lBQ3ZCLE1BQU8sT0FBQSxDQUFBLENBQUE7SUFBQSxLQUNYO0lBQ0EsSUFBQSxJQUFJLENBQUMsQ0FBQSxDQUFFLE1BQVUsSUFBQSxDQUFBLENBQUUsTUFBUSxFQUFBO0lBQ3ZCLE1BQU8sT0FBQSxDQUFBLENBQUEsQ0FBQTtJQUFBLEtBQ1g7SUFDQSxJQUFBLElBQUksQ0FBRSxDQUFBLFFBQUEsQ0FBUyxDQUFJLEdBQUEsQ0FBQSxDQUFFLFNBQVMsQ0FBRyxFQUFBO0lBQzdCLE1BQU8sT0FBQSxDQUFBLENBQUEsQ0FBQTtJQUFBLEtBQ1g7SUFDQSxJQUFBLElBQUksQ0FBRSxDQUFBLFFBQUEsQ0FBUyxDQUFJLEdBQUEsQ0FBQSxDQUFFLFNBQVMsQ0FBRyxFQUFBO0lBQzdCLE1BQU8sT0FBQSxDQUFBLENBQUE7SUFBQSxLQUNYO0lBQ0EsSUFBQSxJQUFJLENBQUUsQ0FBQSxRQUFBLENBQVMsQ0FBSSxHQUFBLENBQUEsQ0FBRSxTQUFTLENBQUcsRUFBQTtJQUM3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
