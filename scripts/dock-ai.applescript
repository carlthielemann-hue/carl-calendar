-- Dock AI — Command Center on the left, Claude / ChatGPT / Manus docked on the right.
-- Paste into a macOS Shortcut named "Dock AI" as a "Run AppleScript" action (see Settings →
-- Docked AI sidebar). Command Center runs it via shortcuts://run-shortcut with text input:
--   "<target>|<browser>|<sidebar %>"   e.g.  "Claude|Google Chrome|30"
--   target: Claude, ChatGPT, Manus or Undock
-- Needs Accessibility permission for Shortcuts (System Settings → Privacy & Security).

on run {input, parameters}
	set args to my splitText(my inputText(input), "|")
	set target to "Claude"
	set browserName to ""
	set pct to 30
	try
		if (item 1 of args) is not "" then set target to item 1 of args
	end try
	try
		set browserName to item 2 of args
	end try
	try
		set pct to (item 3 of args) as integer
	end try
	if pct < 15 or pct > 60 then set pct to 30

	-- Usable area of the desktop (below the menu bar)
	tell application "Finder" to set {sx1, sy1, sx2, sy2} to bounds of window of desktop
	set topY to sy1 + 25
	set screenW to sx2 - sx1
	set screenH to sy2 - topY
	set sideW to round (screenW * pct / 100)
	set mainW to screenW - sideW

	-- The Command Center window: an installed app window first, otherwise the browser's front window
	set mainProc to browserName
	if my hasWindows("Command Center") then set mainProc to "Command Center"
	if mainProc is "" or mainProc is "Shortcuts" then
		tell application "System Events" to set mainProc to name of first application process whose frontmost is true
	end if

	if target is "Undock" then
		my place(mainProc, sx1, topY, screenW, screenH)
		return input
	end if
	my place(mainProc, sx1, topY, mainW, screenH)

	-- The AI window
	set aiProc to target
	try
		if target is "Manus" and my appExists("Manus Studio") then
			set aiProc to "Manus Studio"
			tell application "Manus Studio" to activate
		else if target is "Manus" and not my appExists("Manus") then
			-- no desktop app installed: open the web app as a slim window
			set aiProc to my openWebApp(browserName, "https://manus.im/app")
		else
			tell application target to activate
		end if
	on error
		display dialog "Couldn't open " & target & ". Install its desktop app (claude.ai/download, chatgpt.com/download or manus.im/desktop) and try again." buttons {"OK"} default button 1
		return input
	end try
	delay 0.6
	my place(aiProc, sx1 + mainW, topY, sideW, screenH)
	return input
end run

on place(procName, x, y, w, h)
	tell application "System Events"
		if not (exists application process procName) then return false
		tell application process procName
			repeat 50 times
				if (count of windows) > 0 then exit repeat
				delay 0.2
			end repeat
			if (count of windows) = 0 then return false
			set position of window 1 to {x, y}
			set size of window 1 to {w, h}
		end tell
	end tell
	return true
end place

on hasWindows(procName)
	try
		tell application "System Events"
			if not (exists application process procName) then return false
			return (count of windows of application process procName) > 0
		end tell
	on error
		return false
	end try
end hasWindows

on appExists(appName)
	try
		do shell script "open -Ra " & quoted form of appName
		return true
	on error
		return false
	end try
end appExists

-- Manus has no desktop app: open it as a slim app-style window in the browser.
on openWebApp(browserName, theURL)
	if {"Google Chrome", "Brave Browser", "Microsoft Edge", "Chromium"} contains browserName then
		do shell script "open -na " & quoted form of browserName & " --args --app=" & quoted form of theURL
		return browserName
	end if
	if browserName is "Safari" then
		tell application "Safari"
			make new document with properties {URL:theURL}
			activate
		end tell
		return "Safari"
	end if
	open location theURL
	delay 1
	tell application "System Events" to return name of first application process whose frontmost is true
end openWebApp

on inputText(input)
	try
		if class of input is list then
			if (count of input) = 0 then return ""
			return (item 1 of input) as text
		end if
		return input as text
	on error
		return ""
	end try
end inputText

on splitText(t, d)
	set AppleScript's text item delimiters to d
	set parts to text items of t
	set AppleScript's text item delimiters to ""
	return parts
end splitText
