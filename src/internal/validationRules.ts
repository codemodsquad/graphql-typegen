import without from 'lodash/without'
import { specifiedRules, NoUnusedFragmentsRule } from 'graphql'

export const validationRules = without(specifiedRules, NoUnusedFragmentsRule)
