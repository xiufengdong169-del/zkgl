import { describe, expect, it } from "vitest";

import { assertAffectedRows, parseDatabaseEnvironment } from "./database.js";
import { AppError } from "./errors.js";

describe("database integration helpers", () => {
  it("乐观更新必须且只能影响一行", () => {
    expect(() => assertAffectedRows(1, "冲突")).not.toThrow();
    expect(() => assertAffectedRows(0, "冲突")).toThrow("冲突");
  });

  it("数据库连接环境变量缺失时返回明确配置错误", () => {
    expect(() =>
      parseDatabaseEnvironment({
        DB_HOST: " ",
        DB_PORT: "3306",
        DB_NAME: "zkgl",
        DB_USER: "",
        DB_PASSWORD: "",
      }),
    ).toThrow(AppError);
    expect(() =>
      parseDatabaseEnvironment({
        DB_HOST: " ",
        DB_PORT: "3306",
        DB_NAME: "zkgl",
        DB_USER: "",
        DB_PASSWORD: "",
      }),
    ).toThrow("数据库环境变量配置不完整或不合法：DB_HOST、DB_PASSWORD、DB_USER");
  });

  it("数据库连接环境变量会标准化主机、库名、用户名和端口", () => {
    expect(
      parseDatabaseEnvironment({
        DB_HOST: " db.internal ",
        DB_PORT: "3307",
        DB_NAME: " zkgl ",
        DB_USER: " zkgl_user ",
        DB_PASSWORD: " secret ",
      }),
    ).toEqual({
      DB_HOST: "db.internal",
      DB_PORT: 3307,
      DB_NAME: "zkgl",
      DB_USER: "zkgl_user",
      DB_PASSWORD: " secret ",
    });
  });
});
