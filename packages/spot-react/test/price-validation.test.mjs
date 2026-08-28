import assert from "node:assert/strict";
import test from "node:test";
import {
  InputErrors,
  Module,
  validateLimitPrice,
  validateTriggerPrice,
} from "../dist/spot-react.js";

test("validates stop-loss and take-profit against market price", () => {
  assert.equal(
    validateTriggerPrice({
      module: Module.STOP_LOSS,
      marketPrice: "100",
      triggerPrice: "100",
    })?.type,
    InputErrors.STOP_LOSS_TRIGGER_PRICE_GREATER_THAN_MARKET_PRICE,
  );
  assert.equal(
    validateTriggerPrice({
      module: Module.STOP_LOSS,
      marketPrice: "100",
      triggerPrice: "95",
    }),
    undefined,
  );
  assert.equal(
    validateTriggerPrice({
      module: Module.TAKE_PROFIT,
      marketPrice: "100",
      triggerPrice: "100",
    })?.type,
    InputErrors.TAKE_PROFIT_TRIGGER_PRICE_LESS_THAN_MARKET_PRICE,
  );
  assert.equal(
    validateTriggerPrice({
      module: Module.TAKE_PROFIT,
      marketPrice: "100",
      triggerPrice: "110",
    }),
    undefined,
  );
});

test("requires active trigger and limit prices", () => {
  assert.equal(
    validateTriggerPrice({
      module: Module.STOP_LOSS,
      triggerPrice: "",
    })?.type,
    InputErrors.EMPTY_TRIGGER_PRICE,
  );
  assert.equal(
    validateLimitPrice({
      module: Module.LIMIT,
      limitPrice: "",
      isMarketOrder: false,
    })?.type,
    InputErrors.MISSING_LIMIT_PRICE,
  );
});

test("validates an execution limit against its trigger price", () => {
  assert.equal(
    validateLimitPrice({
      module: Module.STOP_LOSS,
      triggerPrice: "95",
      limitPrice: "95",
      isMarketOrder: false,
    })?.type,
    InputErrors.TRIGGER_LIMIT_PRICE_GREATER_THAN_TRIGGER_PRICE,
  );
  assert.equal(
    validateLimitPrice({
      module: Module.TAKE_PROFIT,
      marketPrice: "100",
      triggerPrice: "110",
      limitPrice: "105",
      isMarketOrder: false,
    }),
    undefined,
  );
  assert.equal(
    validateLimitPrice({
      module: Module.STOP_LOSS,
      marketPrice: "100",
      triggerPrice: "95",
      limitPrice: "100",
      isMarketOrder: true,
    }),
    undefined,
  );
});
