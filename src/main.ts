import * as core from '@actions/core'
import * as github from '@actions/github'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get inputs
    const token = core.getInput('github-token', { required: true })
    const triggerPhrase: string = '/retest'

    // Get event context
    const { context } = github
    const { eventName, payload } = context

    core.info(`Event name: ${eventName}`)

    // Verify this is an issue_comment event
    if (eventName !== 'issue_comment') {
      core.setFailed(
        `This action only works with issue_comment events. Current event: ${eventName}`
      )
      return
    }

    // Verify the comment is on a pull request
    if (!payload.issue?.pull_request) {
      core.info('Comment is not on a pull request. Skipping.')
      return
    }

    // Verify the comment body matches the trigger phrase
    const commentBody = payload.comment?.body?.trim()
    if (commentBody !== triggerPhrase) {
      core.info(
        `Comment body "${commentBody}" does not match trigger phrase "${triggerPhrase}". Skipping.`
      )
      return
    }

    core.info(`Trigger phrase "${triggerPhrase}" detected!`)

    // Create an authenticated GitHub client
    const octokit = github.getOctokit(token)

    // Get pull request details
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: payload.issue.number
    })

    core.info(
      `PR #${payload.issue.number}: ${pullRequest.title} (SHA: ${pullRequest.head.sha})`
    )

    // Get workflow runs for the PR's head commit
    const { data: workflowRuns } =
      await octokit.rest.actions.listWorkflowRunsForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        head_sha: pullRequest.head.sha,
        per_page: 100
      })

    core.info(`Found ${workflowRuns.total_count} workflow runs for this commit`)

    // Filter for failed workflow runs
    const failedRuns = workflowRuns.workflow_runs.filter(
      (run) =>
        run.conclusion === 'failure' ||
        run.conclusion === 'timed_out' ||
        run.conclusion === 'cancelled'
    )

    if (failedRuns.length === 0) {
      core.info('No failed workflow runs found to rerun.')
      core.setOutput('rerun-count', '0')
      return
    }

    core.info(
      `Found ${failedRuns.length} failed workflow run(s). Triggering reruns...`
    )

    // Re-run each failed workflow
    let rerunCount = 0
    for (const run of failedRuns) {
      try {
        await octokit.rest.actions.reRunWorkflow({
          owner: context.repo.owner,
          repo: context.repo.repo,
          run_id: run.id
        })
        core.info(
          `✓ Re-triggered workflow: ${run.name} (ID: ${run.id}, Run #${run.run_number})`
        )
        rerunCount++
      } catch (error) {
        if (error instanceof Error) {
          core.warning(
            `Failed to re-run workflow ${run.name} (ID: ${run.id}): ${error.message}`
          )
        }
      }
    }

    core.info(`Successfully re-triggered ${rerunCount} workflow run(s).`)
    core.setOutput('rerun-count', rerunCount.toString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
