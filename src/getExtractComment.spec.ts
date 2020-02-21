import * as graphql from 'graphql'
import { describe, it } from 'mocha'
import { expect } from 'chai'
import getExtractComment from './getExtractComment'

function fragment([
  text,
]: TemplateStringsArray): graphql.FragmentDefinitionNode {
  const doc = graphql.parse(text)
  if (doc.definitions.length !== 1)
    throw new Error('document must have one definition')
  const [def] = doc.definitions
  if (def.kind !== 'FragmentDefinition')
    throw new Error('document must have a single fragment definition')
  return def
}

function field([text]: TemplateStringsArray): graphql.FieldNode {
  const frag = fragment([
    `fragment Foo on Bar {
    ${text}
  }`,
  ] as any)
  if (frag.selectionSet.selections.length !== 1)
    throw new Error('only one field must be given')
  const [field] = frag.selectionSet.selections
  if (field.kind !== 'Field') throw new Error('only selection must be a field')
  return field
}

describe(`getExtractComment`, function() {
  describe(`on fragment`, function() {
    it(`returns null if there's no comment`, function() {
      expect(
        getExtractComment(fragment`
          fragment Foo on Bar {
            baz
          }
        `)
      ).to.be.null
    })
    it(`returns null if no comments are relevant`, function() {
      expect(
        getExtractComment(fragment`
          # @graphql-typegen test
          fragment Foo on Bar {
            baz
          }
        `)
      ).to.be.null
    })
    it(`returns true if there's a comment without an as clause`, function() {
      expect(
        getExtractComment(fragment`
          # blah
          # @graphql-typegen extract
          fragment Foo on Bar {
            baz
          }
        `)
      ).to.be.true
    })
    it(`returns identifier from as clause if given`, function() {
      expect(
        getExtractComment(fragment`
          # @graphql-typegen extract as Foob
          fragment Foo on Bar {
            baz
          }
        `)
      ).to.equal('Foob')
    })
    it(`throws if invalid token comes after extract`, function() {
      expect(() =>
        getExtractComment(fragment`
          # @graphql-typegen extract ass
          fragment Foo on Bar {
            baz
          }
        `)
      ).to.throw('invalid token after extract: ass')
    })
    it(`throws if extract as identifier is invalid`, function() {
      expect(() =>
        getExtractComment(fragment`
          # @graphql-typegen extract as 0foo
          fragment Foo on Bar {
            baz
          }
        `)
      ).to.throw('invalid extract as identifier: 0foo')
    })
  })
  describe(`on field`, function() {
    it(`returns null if there's no comment`, function() {
      expect(getExtractComment(field`baz`)).to.be.null
    })
    it(`returns null if no comments are relevant`, function() {
      expect(
        getExtractComment(field`
          # @graphql-typegen test
          baz
        `)
      ).to.be.null
    })
    it(`returns true if there's a comment without an as clause`, function() {
      expect(
        getExtractComment(field`
          # blah
          # @graphql-typegen extract
          baz
        `)
      ).to.be.true
    })
    it(`returns identifier from as clause if given`, function() {
      expect(
        getExtractComment(field`
          # @graphql-typegen extract as Foob
          baz
        `)
      ).to.equal('Foob')
    })
    it(`throws if invalid token comes after extract`, function() {
      expect(() =>
        getExtractComment(field`
          # @graphql-typegen extract ass
          baz
        `)
      ).to.throw('invalid token after extract: ass')
    })
    it(`throws if extract as identifier is invalid`, function() {
      expect(() =>
        getExtractComment(field`
          # @graphql-typegen extract as 0foo
          baz
        `)
      ).to.throw('invalid extract as identifier: 0foo')
    })
  })
})
