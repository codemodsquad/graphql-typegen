import * as graphql from 'graphql'
import { pragma } from './pragma'
import isValidIdentifier from './isValidIdentifier'
import { ObjectType } from './config'

export type External = string | { import: string; cwd: string }

export type ConfigDirectives = {
  external: External | undefined
  extract: string | true | undefined
  objectType: ObjectType | undefined
  useReadOnlyTypes: boolean | undefined
  addTypename: boolean | undefined
  ignoreData: boolean | undefined
  ignoreVariables: boolean | undefined
}

export default function getConfigDirectives(
  lines: Iterable<string>,
  { cwd, nodeKind }: { cwd: string; nodeKind?: graphql.KindEnum }
): ConfigDirectives {
  let external: External | undefined = undefined
  let extract: string | true | undefined = undefined
  let objectType: ObjectType | undefined = undefined
  let useReadOnlyTypes: boolean | undefined = undefined
  let addTypename: boolean | undefined = undefined
  let ignoreData: boolean | undefined = undefined
  let ignoreVariables: boolean | undefined = undefined

  for (let value of lines) {
    value = value.trim()
    if (!value) continue
    const parts = value.split(/\s+/g, 4)
    if (parts[0] !== pragma) continue
    if (parts[1] === 'extract') {
      if (extract !== undefined) {
        throw new Error(`duplicate extract directive: ${value}`)
      }
      extract = true
      if (parts[2]) {
        if (parts[2] == 'as') {
          if (!parts[3]) throw new Error(`missing identifier after extract as`)
          else if (isValidIdentifier(parts[3])) extract = parts[3]
          else throw new Error(`invalid extract as identifier: ${parts[3]}`)
        } else {
          throw new Error(`invalid token after extract: ${parts[2]}`)
        }
      }
    } else if (parts[1] === 'external') {
      if (external !== undefined) {
        throw new Error(`duplicate external directive: ${value}`)
      }
      if (parts[2] == 'as') {
        if (!parts[3]) throw new Error(`missing identifier after external as`)
        else if (parts[3] === 'import') {
          external = { import: value.substring(value.indexOf('import')), cwd }
        } else if (isValidIdentifier(parts[3])) external = parts[3]
        else throw new Error(`invalid external as identifier: ${parts[3]}`)
      } else {
        if (!parts[2]) throw new Error(`missing as clause after external`)
        throw new Error(`invalid token after external: ${parts[2]}`)
      }
    } else if (parts[1] === 'ignore') {
      if (nodeKind !== 'OperationDefinition') {
        throw new Error('ignore is only supported on operation definitions!')
      }
      if (parts[2]) {
        switch (parts[2]) {
          case 'data':
            ignoreData = true
            break
          case 'variables':
            ignoreVariables = true
            break
          default:
            throw new Error(`invalid token after ignore: ${parts[2]}`)
        }
      } else {
        ignoreData = ignoreVariables = true
      }
      if (parts.length > 3) {
        throw new Error(`invalid token after ignore ${parts[2]}: ${parts[3]}`)
      }
    } else {
      for (let i = 1; i < parts.length; i++) {
        switch (parts[i]) {
          case 'exact':
          case 'inexact':
          case 'ambiguous':
            if (objectType !== undefined) {
              throw new Error(
                `duplicate object type directive: ${parts[i]} (after previous ${objectType})`
              )
            }
            objectType = parts[i] as any
            break
          case 'readOnly':
          case 'mutable':
            if (useReadOnlyTypes !== undefined) {
              throw new Error(
                `duplicate readOnly/mutable directive: ${
                  parts[i]
                } (after previous ${useReadOnlyTypes ? 'readOnly' : 'mutable'})`
              )
            }
            useReadOnlyTypes = parts[i] === 'readOnly'
            break
          case 'addTypename':
          case 'noTypename':
            if (addTypename !== undefined) {
              throw new Error(
                `duplicate addTypename directive: ${parts[i]} (after previous ${
                  addTypename ? 'addTypename' : 'noTypename'
                })`
              )
            }
            addTypename = parts[i] === 'addTypename'
            break
          default:
            throw new Error(`invalid directive: ${parts[i]}`)
        }
      }
    }
  }
  return {
    external,
    extract,
    objectType,
    useReadOnlyTypes,
    addTypename,
    ignoreData,
    ignoreVariables,
  }
}
