import express, { NextFunction, Request, Response } from "express";
import * as OpenApiValidator from "express-openapi-validator";
import fs from "fs";
import path from "path";
import { OpenAPIV3 } from "express-openapi-validator/dist/framework/types";
import YAML from "yaml";
import { Exception, ExceptionType } from "../models/exception.model";
import { Locals } from "../interfaces/locals.interface";
import { getConfig } from "../utils/config.utils";
import logger from "../utils/logger.utils";

const protocolServerLevel = `${getConfig().app.mode.toUpperCase()}-${getConfig().app.gateway.mode.toUpperCase()}`;
const specFolder = 'schemas';

export class OpenApiValidatorMiddleware {
  private static instance: OpenApiValidatorMiddleware;
  private static cachedOpenApiValidator: {
    [filename: string]: {
      count: number,
      requestHandler: express.RequestHandler[],
      apiSpec: OpenAPIV3.Document
    }
  } = {};
  private static cachedFileLimit: number;

  private constructor() {
    OpenApiValidatorMiddleware.cachedFileLimit = getConfig().app.openAPIValidator?.cachedFileLimit || 5;
  }

  public static getInstance(): OpenApiValidatorMiddleware {
    if (!OpenApiValidatorMiddleware.instance) {
      OpenApiValidatorMiddleware.instance = new OpenApiValidatorMiddleware();
    }
    return OpenApiValidatorMiddleware.instance;
  }

  private getApiSpec(specFile: string): OpenAPIV3.Document {
    const apiSpecYAML = fs.readFileSync(specFile, "utf8");
    const apiSpec = YAML.parse(apiSpecYAML);
    return apiSpec;
  };

  public initOpenApiMiddleware() {
    try {

      const files = fs.readdirSync(specFolder);
      const fileNames = files.filter(file => fs.lstatSync(path.join(specFolder, file)).isFile() && (file.endsWith('.yaml') || file.endsWith('.yml')));
      const cachedFileLimit: number = OpenApiValidatorMiddleware.cachedFileLimit;
      logger.info(`OpenAPIValidator Cache count ${cachedFileLimit}`);
      for (let i = 0; (i < cachedFileLimit && fileNames[i]); i++) {
        const file = `${specFolder}/${fileNames[i]}`;
        if (!OpenApiValidatorMiddleware.cachedOpenApiValidator[file]) {
          logger.info(`Intially cache Not found loadApiSpec file. Loading.... ${file}`);
          const apiSpec = this.getApiSpec(file);
          OpenApiValidatorMiddleware.cachedOpenApiValidator[file] = {
            apiSpec,
            count: 0,
            requestHandler: OpenApiValidator.middleware({
              apiSpec,
              validateRequests: true,
              validateResponses: false,
              $refParser: {
                mode: "dereference"
              }
            })
          }
        }
      }
    } catch (err) {
      logger.error('Error in initializing open API middleware', err);
    }
  }

  public getOpenApiMiddleware(specFile: string): express.RequestHandler[] {
    try {
      if (OpenApiValidatorMiddleware.cachedOpenApiValidator[specFile]) {
        const cachedValidator = OpenApiValidatorMiddleware.cachedOpenApiValidator[specFile];
        cachedValidator.count = cachedValidator.count > 1000 ? cachedValidator.count : cachedValidator.count + 1;
        logger.info(`Cache found for spec ${specFile}`);
        return cachedValidator.requestHandler;
      } else {
        const cashedSpec = Object.entries(OpenApiValidatorMiddleware.cachedOpenApiValidator);
        const cachedFileLimit: number = OpenApiValidatorMiddleware.cachedFileLimit;
        if (cashedSpec.length >= cachedFileLimit) {
          const specWithLeastCount = cashedSpec.reduce((minEntry, currentEntry) => {
            return currentEntry[1].count < minEntry[1].count ? currentEntry : minEntry;
          }) || cashedSpec[0];
          logger.info(`Cache count reached limit. Deleting from cache.... ${specWithLeastCount[0]}`);
          delete OpenApiValidatorMiddleware.cachedOpenApiValidator[specWithLeastCount[0]];
        }
        logger.info(`Cache Not found loadApiSpec file. Loading.... ${specFile}`);
        const apiSpec = this.getApiSpec(specFile);
        OpenApiValidatorMiddleware.cachedOpenApiValidator[specFile] = {
          apiSpec,
          count: 1,
          requestHandler: OpenApiValidator.middleware({
            apiSpec,
            validateRequests: true,
            validateResponses: false,
            $refParser: {
              mode: "dereference"
            }
          })
        }
        return OpenApiValidatorMiddleware.cachedOpenApiValidator[specFile].requestHandler;
      }
    } catch (err) {
      logger.error('Error in getOpenApiMiddleware', err);
      return []
    }
  };
}

export const schemaErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('OpenApiValidator Error', err);
  if (err instanceof Exception) {
    next(err);
  } else {
    const errorData = new Exception(
      ExceptionType.OpenApiSchema_ParsingError,
      `OpenApiValidator Error at ${protocolServerLevel}`,
      err.status,
      err
    );

    next(errorData);
  }
};

export const openApiValidatorMiddleware = async (
  req: Request,
  res: Response<{}, Locals>,
  next: NextFunction
) => {
  const version = req?.body?.context?.core_version
    ? req?.body?.context?.core_version
    : req?.body?.context?.version;
  let specFile = `${specFolder}/core_${version}.yaml`;

  if (getConfig().app.useLayer2Config) {
    let doesLayer2ConfigExist = false;
    let layer2ConfigFilename = `${req?.body?.context?.domain}_${version}.yaml`;
    let specialCharsRe = /[:\/]/gi;
    layer2ConfigFilename = layer2ConfigFilename.replace(specialCharsRe, "_");
    try {
      doesLayer2ConfigExist = (
        await fs.promises.readdir(
          `${path.join(path.resolve(__dirname, "../../"))}/${specFolder}`
        )
      ).includes(layer2ConfigFilename);
    } catch (error) {
      doesLayer2ConfigExist = false;
    }
    if (doesLayer2ConfigExist) specFile = `${specFolder}/${layer2ConfigFilename}`;
    else {
      if (getConfig().app.mandateLayer2Config) {
        const message = `Layer 2 config file ${layer2ConfigFilename} is not installed and it is marked as required in configuration`
        logger.error(message);
        return next(
          new Exception(
            ExceptionType.Config_AppConfig_Layer2_Missing,
            message,
            422
          )
        );
      }
    }
  }
  const openApiValidator = OpenApiValidatorMiddleware.getInstance().getOpenApiMiddleware(specFile);

  const walkSubstack = function (
    stack: any,
    req: any,
    res: any,
    next: NextFunction
  ) {
    if (typeof stack === "function") {
      stack = [stack];
    }
    const walkStack = function (i: any, err?: any) {
      if (err) {
        return schemaErrorHandler(err, req, res, next);
      }
      if (i >= stack.length) {
        return next();
      }
      stack[i](req, res, walkStack.bind(null, i + 1));
    };
    walkStack(0);
  };
  walkSubstack([...openApiValidator], req, res, next);
};
