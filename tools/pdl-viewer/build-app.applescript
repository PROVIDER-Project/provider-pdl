-- Projektverzeichnis ermitteln: App liegt im Repo-Root, :: geht ein Level hoch
set repoPath to POSIX path of ((path to me as text) & "::")
tell application "Terminal"
    do script repoPath & "start-viewer.sh"
    activate
end tell
