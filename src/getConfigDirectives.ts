import { pragma } from './pragma'
import isValidIdentifier from './isValidIdentifier'
import { ObjectType } from './config'

export type ConfigDirectives = {
  external: string | undefined
  extract: string | true | undefined
  objectType: ObjectType | undefined
  useReadOnlyTypes: boolean | undefined
  addTypename: boolean | undefined
}

export default function getConfigDirectives(
  lines: Iterable<string>
): ConfigDirectives {
  let external: string | undefined = undefined
  let extract: string | true | undefined = undefined
  let objectType: ObjectType | undefined = undefined
  let useReadOnlyTypes: boolean | undefined = undefined
  let addTypename: boolean | undefined = undefined
  for (const value of lines) {
    if (!value) continue
    const parts = value.trim().split(/\s+/g, 4)
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
        else if (isValidIdentifier(parts[3])) external = parts[3]
        else throw new Error(`invalid external as identifier: ${parts[3]}`)
      } else {
        if (!parts[2]) throw new Error(`missing as clause after external`)
        throw new Error(`invalid token after external: ${parts[2]}`)
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
  return { external, extract, objectType, useReadOnlyTypes, addTypename }
}
