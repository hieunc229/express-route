import chalk from "chalk";

import { Express } from "express";
import { createElement } from "react";
import { RouteObject } from "react-router-dom";
import { createStaticHandler } from "react-router-dom/server";

import bundleClientSSR from "./bundler";
import createClientSSRRequest from "./handler";

import { getAppComponent } from "./generator";
import {
  RumboStaticRoute,
  importPathsToClientRoutes,
  layoutRegex,
  resolveImports,
} from "../utils/route";

type Props = {
  location: string;
  publicPath: string;
  rootDir: string;
  distDir: string;
  route: string;
  app: Express;
  debug?: boolean;
  clientUseRouter?: boolean;
  staticImports: null | {
    [subRoute: string]: RumboStaticRoute;
  };
};

export default async function registerClientSSR(props: Props) {
  const {
    app,
    publicPath,
    debug = false,
    distDir,
    route,
    rootDir,
    location,
    clientUseRouter = false,
    staticImports,
  } = props;

  debug && console.log(chalk.green(`[Client SSR]`, route));

  const paths: RumboStaticRoute[] = staticImports
    ? Object.entries(staticImports).map(([, item]) => item)
    : resolveImports({
        route,
        location,
        type: "client",
      }).map((item) => {
        return {
          ...item,
          staticImport: require(item.filePath),
        };
      });

  const routes = importPathsToClientRoutes({ paths });
  const staticRoutes: RouteObject[] = Object.entries(routes)
    .filter((item) => !layoutRegex.test(item[0]))
    .map(([route, { handler }]): any => {
      const layoutHandler =
        routes[route.replace(/\/[a-z:0-9_]+$/, "/_layout")] ||
        routes[`${route}/_layout`];
      if (layoutHandler?.layout) {
        return {
          path: route,
          element: createElement(
            layoutHandler.layout.default,
            handler.layoutProps,
            createElement(handler.default)
          ),
        };
      }
      return {
        path: route,
        Component: handler.default,
      };
    });

  const staticHandler = createStaticHandler(staticRoutes);
  const AppComponent = (
    staticImports
      ? staticImports.__rumboClientSSR.staticImport
      : getAppComponent({ publicPath, route, debug, rootDir })
  ).default;

  // register paths
  Object.entries(routes).forEach(([r, props]) => {
    app.get(
      r,
      createClientSSRRequest(props, {
        staticRoutes,
        staticHandler,
        AppComponent,
        route,
        clientUseRouter,
      })
    );
    debug && console.log(chalk.gray(`-`, r));
  });

  if (!staticImports) {
    debug && console.log(chalk.gray("Bundle client..."));
    await bundleClientSSR({
      entries: paths,
      publicPath,
      routes,
      route,
      distDir,
      debug,
    });
  }
}
