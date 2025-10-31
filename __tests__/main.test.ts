/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as github from '../__fixtures__/github.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)

// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  let mockOctokit: {
    rest: {
      pulls: {
        get: ReturnType<typeof jest.fn>
      }
      actions: {
        listWorkflowRunsForRepo: ReturnType<typeof jest.fn>
        reRunWorkflow: ReturnType<typeof jest.fn>
      }
    }
  }

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Set default inputs
    core.getInput.mockImplementation((name: string) => {
      if (name === 'github-token') return 'fake-token'
      return ''
    })

    // Mock octokit instance
    mockOctokit = {
      rest: {
        pulls: {
          get: jest.fn()
        },
        actions: {
          listWorkflowRunsForRepo: jest.fn(),
          reRunWorkflow: jest.fn()
        }
      }
    }

    github.getOctokit.mockReturnValue(mockOctokit)

    // Set default context
    github.context.eventName = 'issue_comment'
    github.context.payload = {
      comment: { body: '/retest' },
      issue: {
        number: 123,
        pull_request: {}
      }
    }
    github.context.repo = {
      owner: 'test-owner',
      repo: 'test-repo'
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Fails if event is not issue_comment', async () => {
    github.context.eventName = 'push'

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'This action only works with issue_comment events. Current event: push'
    )
  })

  it('Skips if comment is not on a pull request', async () => {
    github.context.payload = {
      comment: { body: '/retest' },
      issue: { number: 123 }
    }

    await run()

    expect(core.info).toHaveBeenCalledWith(
      'Comment is not on a pull request. Skipping.'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('Skips if comment does not match trigger phrase', async () => {
    github.context.payload = {
      comment: { body: '/test' },
      issue: {
        number: 123,
        pull_request: {}
      }
    }

    await run()

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('does not match trigger phrase')
    )
    expect(mockOctokit.rest.pulls.get).not.toHaveBeenCalled()
  })

  it('Reruns failed workflow runs successfully', async () => {
    const mockPullRequest = {
      title: 'Test PR',
      head: { sha: 'abc123' }
    }

    const mockWorkflowRuns = {
      total_count: 3,
      workflow_runs: [
        {
          id: 1,
          name: 'Test Workflow 1',
          run_number: 10,
          conclusion: 'failure'
        },
        {
          id: 2,
          name: 'Test Workflow 2',
          run_number: 11,
          conclusion: 'success'
        },
        {
          id: 3,
          name: 'Test Workflow 3',
          run_number: 12,
          conclusion: 'timed_out'
        }
      ]
    }

    mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPullRequest })
    mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: mockWorkflowRuns
    })
    mockOctokit.rest.actions.reRunWorkflow.mockResolvedValue({})

    await run()

    expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      pull_number: 123
    })

    expect(
      mockOctokit.rest.actions.listWorkflowRunsForRepo
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      head_sha: 'abc123',
      per_page: 100
    })

    // Should rerun workflows with IDs 1 and 3 (failure and timed_out)
    expect(mockOctokit.rest.actions.reRunWorkflow).toHaveBeenCalledTimes(2)
    expect(mockOctokit.rest.actions.reRunWorkflow).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      run_id: 1
    })
    expect(mockOctokit.rest.actions.reRunWorkflow).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      run_id: 3
    })

    expect(core.setOutput).toHaveBeenCalledWith('rerun-count', '2')
    expect(core.info).toHaveBeenCalledWith(
      'Successfully re-triggered 2 workflow run(s).'
    )
  })

  it('Handles no failed workflows gracefully', async () => {
    const mockPullRequest = {
      title: 'Test PR',
      head: { sha: 'abc123' }
    }

    const mockWorkflowRuns = {
      total_count: 1,
      workflow_runs: [
        {
          id: 1,
          name: 'Test Workflow',
          run_number: 10,
          conclusion: 'success'
        }
      ]
    }

    mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPullRequest })
    mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: mockWorkflowRuns
    })

    await run()

    expect(mockOctokit.rest.actions.reRunWorkflow).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      'No failed workflow runs found to rerun.'
    )
    expect(core.setOutput).toHaveBeenCalledWith('rerun-count', '0')
  })

  it('Handles workflow rerun failures gracefully', async () => {
    const mockPullRequest = {
      title: 'Test PR',
      head: { sha: 'abc123' }
    }

    const mockWorkflowRuns = {
      total_count: 2,
      workflow_runs: [
        {
          id: 1,
          name: 'Test Workflow 1',
          run_number: 10,
          conclusion: 'failure'
        },
        {
          id: 2,
          name: 'Test Workflow 2',
          run_number: 11,
          conclusion: 'failure'
        }
      ]
    }

    mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPullRequest })
    mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: mockWorkflowRuns
    })

    // First call succeeds, second fails
    mockOctokit.rest.actions.reRunWorkflow
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('API error'))

    await run()

    expect(mockOctokit.rest.actions.reRunWorkflow).toHaveBeenCalledTimes(2)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to re-run workflow')
    )
    expect(core.setOutput).toHaveBeenCalledWith('rerun-count', '1')
  })

  it('Handles cancelled workflows', async () => {
    const mockPullRequest = {
      title: 'Test PR',
      head: { sha: 'abc123' }
    }

    const mockWorkflowRuns = {
      total_count: 1,
      workflow_runs: [
        {
          id: 1,
          name: 'Test Workflow',
          run_number: 10,
          conclusion: 'cancelled'
        }
      ]
    }

    mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPullRequest })
    mockOctokit.rest.actions.listWorkflowRunsForRepo.mockResolvedValue({
      data: mockWorkflowRuns
    })
    mockOctokit.rest.actions.reRunWorkflow.mockResolvedValue({})

    await run()

    expect(mockOctokit.rest.actions.reRunWorkflow).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      run_id: 1
    })
    expect(core.setOutput).toHaveBeenCalledWith('rerun-count', '1')
  })
})
