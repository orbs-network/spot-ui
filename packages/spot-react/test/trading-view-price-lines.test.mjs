import assert from "node:assert/strict";
import test from "node:test";
import {
  ChartPriceLineKind,
  createSpotTradingViewPriceLineController,
} from "../dist/spot-react.js";

function createOrderLine() {
  const values = {};
  let moveHandler;
  const line = {
    values,
    removed: false,
    moveTo(price) {
      values.price = price;
      moveHandler?.();
    },
    getPrice: () => values.price,
    onMove(callback) {
      moveHandler = callback;
      return line;
    },
    remove() {
      line.removed = true;
    },
  };

  for (const method of [
    "setBodyBorderColor",
    "setBodyTextColor",
    "setEditable",
    "setLineColor",
    "setLineLength",
    "setLineStyle",
    "setModifyTooltip",
    "setPrice",
    "setText",
  ]) {
    line[method] = (value) => {
      values[method.slice(3, 4).toLowerCase() + method.slice(4)] = value;
      return line;
    };
  }

  return line;
}

function createPriceControl(overrides = {}) {
  return {
    id: ChartPriceLineKind.LIMIT,
    kind: ChartPriceLineKind.LIMIT,
    label: "Limit price",
    price: "12.34",
    priceWei: "12340000",
    percentage: "2",
    hasPrice: true,
    isLoading: false,
    onPriceChange: () => {},
    onReset: () => {},
    ...overrides,
  };
}

test("creates, updates, moves, and removes TradingView price lines", async () => {
  const createdLines = [];
  const chart = {
    async createOrderLine() {
      const line = createOrderLine();
      createdLines.push(line);
      return line;
    },
  };
  const movedPrices = [];
  const controller = createSpotTradingViewPriceLineController(chart, {
    pricePrecision: 2,
    lineLength: 42,
  });
  const limit = createPriceControl({
    onPriceChange: (price) => movedPrices.push(price),
  });

  await controller.sync([limit]);

  assert.equal(createdLines.length, 1);
  assert.deepEqual(createdLines[0].values, {
    price: 12.34,
    text: "Limit price",
    lineColor: "#3b82f6",
    lineStyle: 2,
    lineLength: 42,
    bodyBorderColor: "#3b82f6",
    bodyTextColor: "#ffffff",
    editable: true,
    modifyTooltip: "Set limit price",
  });

  createdLines[0].moveTo(13.456);
  assert.deepEqual(movedPrices, ["13.46"]);

  const updatedPrices = [];
  await controller.sync([
    createPriceControl({
      price: "14.5",
      onPriceChange: (price) => updatedPrices.push(price),
    }),
  ]);
  assert.equal(createdLines.length, 1);
  assert.equal(createdLines[0].values.price, 14.5);

  createdLines[0].moveTo(15.111);
  assert.deepEqual(updatedPrices, ["15.11"]);

  await controller.sync([]);
  assert.equal(createdLines[0].removed, true);
  controller.destroy();
});

test("styles stop-loss and take-profit lines semantically", async () => {
  const createdLines = [];
  const chart = {
    async createOrderLine() {
      const line = createOrderLine();
      createdLines.push(line);
      return line;
    },
  };
  const controller = createSpotTradingViewPriceLineController(chart);

  await controller.sync([
    createPriceControl({
      id: ChartPriceLineKind.STOP_LOSS,
      kind: ChartPriceLineKind.STOP_LOSS,
      label: "Stop loss",
    }),
    createPriceControl({
      id: ChartPriceLineKind.TAKE_PROFIT,
      kind: ChartPriceLineKind.TAKE_PROFIT,
      label: "Take profit",
    }),
  ]);

  assert.equal(createdLines[0].values.lineColor, "#ef4444");
  assert.equal(createdLines[1].values.lineColor, "#22c55e");
  controller.destroy();
});

test("cleans up a line created after a newer sync", async () => {
  let resolveLine;
  const pendingLine = new Promise((resolve) => {
    resolveLine = resolve;
  });
  const chart = { createOrderLine: () => pendingLine };
  const controller = createSpotTradingViewPriceLineController(chart);

  const firstSync = controller.sync([createPriceControl()]);
  await controller.sync([]);
  const staleLine = createOrderLine();
  resolveLine(staleLine);
  await firstSync;

  assert.equal(staleLine.removed, true);
  controller.destroy();
});

test("reports chart API failures", async () => {
  const expectedError = new Error("Order lines are unavailable");
  const errors = [];
  const controller = createSpotTradingViewPriceLineController(
    { createOrderLine: async () => Promise.reject(expectedError) },
    { onError: (error) => errors.push(error) },
  );

  await controller.sync([createPriceControl()]);

  assert.deepEqual(errors, [expectedError]);
  controller.destroy();
});

test("does not create a TradingView line for an empty price", async () => {
  let created = 0;
  const controller = createSpotTradingViewPriceLineController({
    async createOrderLine() {
      created += 1;
      return createOrderLine();
    },
  });

  await controller.sync([
    createPriceControl({ price: "", priceWei: "", hasPrice: false }),
  ]);

  assert.equal(created, 0);
  controller.destroy();
});
