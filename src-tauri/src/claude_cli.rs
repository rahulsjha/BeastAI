// Claude CLI provider.
//
// Runs the user's locally installed `claude` command (Claude Code) as a
// subprocess and returns its answer. This lets Pluely use the user's own
// Claude subscription login instead of an API key — the same mechanism as
// Pluely's "Connect a CLI" feature and NexQ's subscription mode.
//
// Security: ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are removed from the
// child environment so the CLI authenticates with the interactive
// subscription login, never an API key passed by Pluely. No credentials are
// read, copied, or stored by this code.

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct ClaudeCliResult {
    pub success: bool,
    pub text: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClaudeCliStatus {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

fn resolve_claude_bin() -> Option<String> {
    // Honour an explicit override first.
    if let Ok(p) = std::env::var("PLUELY_CLAUDE_BIN") {
        if !p.is_empty() {
            return Some(p);
        }
    }
    // Common install locations + PATH lookup via `which`.
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/claude"),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/local/bin/claude".to_string(),
    ];
    for c in candidates.iter() {
        if std::path::Path::new(c).exists() {
            return Some(c.clone());
        }
    }
    if let Ok(out) = Command::new("which").arg("claude").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    None
}

fn base_command(bin: &str) -> Command {
    let mut cmd = Command::new(bin);
    // Force subscription auth: never pass an API key to the child.
    cmd.env_remove("ANTHROPIC_API_KEY");
    cmd.env_remove("ANTHROPIC_AUTH_TOKEN");
    // Run in a neutral working directory.
    if let Ok(tmp) = std::env::var("TMPDIR") {
        cmd.current_dir(tmp);
    } else {
        cmd.current_dir("/tmp");
    }
    cmd
}

#[tauri::command]
pub async fn claude_cli_status() -> Result<ClaudeCliStatus, String> {
    let bin = match resolve_claude_bin() {
        Some(b) => b,
        None => {
            return Ok(ClaudeCliStatus {
                available: false,
                path: None,
                version: None,
            })
        }
    };
    let version = base_command(&bin)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());
    Ok(ClaudeCliStatus {
        available: true,
        path: Some(bin),
        version,
    })
}

/// Send one prompt to the claude CLI (print mode) and return the answer.
///
/// `session_id`  — when provided on the first call, starts a named session;
///                 on later calls set `resume = true` to continue it so the
///                 conversation keeps context without resending full history.
/// `model`       — "haiku" | "sonnet" | "opus" | a model id. Defaults to haiku
///                 for low latency.
#[tauri::command]
pub async fn claude_cli_response(
    prompt: String,
    model: Option<String>,
    session_id: Option<String>,
    resume: Option<bool>,
) -> Result<ClaudeCliResult, String> {
    let bin = match resolve_claude_bin() {
        Some(b) => b,
        None => {
            return Ok(ClaudeCliResult {
                success: false,
                text: None,
                error: Some(
                    "claude CLI not found. Install Claude Code and run `claude` once to log in."
                        .to_string(),
                ),
            })
        }
    };

    let model = model.unwrap_or_else(|| "haiku".to_string());
    let mut cmd = base_command(&bin);
    cmd.arg("-p").arg(&prompt).arg("--model").arg(&model);

    // Coding/debug routing: Opus runs at high effort for correctness.
    if model == "opus" || model == "claude-opus-5-5" {
        cmd.arg("--effort").arg("high");
    }

    if let Some(sid) = session_id.as_ref() {
        if resume.unwrap_or(false) {
            cmd.arg("--resume").arg(sid);
        } else {
            cmd.arg("--session-id").arg(sid);
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run claude CLI: {e}"))?;

    if output.status.success() {
        Ok(ClaudeCliResult {
            success: true,
            text: Some(String::from_utf8_lossy(&output.stdout).trim().to_string()),
            error: None,
        })
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(ClaudeCliResult {
            success: false,
            text: None,
            error: Some(if err.is_empty() { out } else { err }),
        })
    }
}
