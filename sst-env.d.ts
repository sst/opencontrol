/* This file is auto-generated by SST. Do not edit. */
/* tslint:disable */
/* eslint-disable */
/* deno-fmt-ignore-file */

declare module "sst" {
  export interface Resource {
    AnthropicApiKey: {
      type: "sst.sst.Secret"
      value: string
    }
    Api: {
      name: string
      type: "sst.aws.Function"
      url: string
    }
    Auth: {
      type: "sst.sst.Linkable"
      url: string
    }
    DatabaseMigrator: {
      name: string
      type: "sst.aws.Function"
    }
    Docs: {
      type: "sst.aws.Astro"
      url: string
    }
    Postgres: {
      clusterArn: string
      database: string
      host: string
      password: string
      port: number
      reader: string
      secretArn: string
      type: "sst.aws.Aurora"
      username: string
    }
    Router: {
      type: "sst.aws.Router"
      url: string
    }
    Storage: {
      name: string
      type: "sst.aws.Bucket"
    }
    StoragePublic: {
      name: string
      type: "sst.aws.Bucket"
    }
    Vpc: {
      bastion: string
      type: "sst.aws.Vpc"
    }
    Web: {
      type: "sst.aws.StaticSite"
      url: string
    }
    Zero: {
      service: string
      type: "sst.aws.Service"
      url: string
    }
    ZeroReplication: {
      service: string
      type: "sst.aws.Service"
      url: string
    }
  }
}
/// <reference path="sst-env.d.ts" />

import "sst"
export {}
