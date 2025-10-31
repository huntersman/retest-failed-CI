import type * as github from '@actions/github'
import { jest } from '@jest/globals'

export const getOctokit = jest.fn<typeof github.getOctokit>()

export const context = {
  eventName: 'issue_comment',
  payload: {},
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  }
}
