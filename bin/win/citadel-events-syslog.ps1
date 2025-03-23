function global:CurrentTimeAsIso {
	return (Get-Date).ToUniversalTime().ToString("o")
}

function global:CreateMessage {
	param ($event, $result, $level, $description)

	$message = @{
		timestamp = CurrentTimeAsIso
		id = Get-Random -Minimum ([Int64]::MinValue) -Maximum ([Int64]::MaxValue)
        browseragent = @{
            event = $event
            result = $result
			level = $level
			description = $description
        }
    }

	return $message | ConvertTo-Json -Compress
}

function global:LogMessage {
	param ($message, $systemTime, $computer, $processId)

    $systemTime = if ($systemTime) { $systemTime } else { (CurrentTimeAsIso) }
    $computer = if ($computer) { $computer } else { "localhost" }
    $processId = if ($processId) { $processId } else { "0" }

	Write-Host "$systemTime $computer BrowserAgent[$processId]: $message"
}

# Function to parse event XML
function global:LogEvent {
    param ($EventXml)

    $xml = [xml]$EventXml
    $ns = New-Object Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace("evt", "http://schemas.microsoft.com/win/2004/08/events/event")

	# Parse System node
    $system = $xml.SelectSingleNode("//evt:System", $ns)

	$systemTime = $system.SelectSingleNode("evt:TimeCreated", $ns).SystemTime
	$processId = $system.SelectSingleNode("evt:Execution", $ns).ProcessID
	$computer = $system.SelectSingleNode("evt:Computer", $ns).'#text'

	# Parse EventData node
    $eventData = $xml.SelectSingleNode("//evt:EventData", $ns)

	$jsonMessage = $eventData.SelectSingleNode("evt:Data", $ns).'#text'

	return LogMessage $jsonMessage $systemTime $computer $processId
}


# Load the required assembly
Add-Type -AssemblyName System.Core

# Create event watcher
$query = "*[System[Provider[@Name='Browser Agent']]]"
$eventQuery = [System.Diagnostics.Eventing.Reader.EventLogQuery]::new("Application", [System.Diagnostics.Eventing.Reader.PathType]::LogName, $query)
$watcher = [System.Diagnostics.Eventing.Reader.EventLogWatcher]::new($eventQuery)

# Create an event handler
$action = {
	try {
		LogEvent $EventArgs.EventRecord.ToXml()
	}
	catch {
		$msg = CreateMessage "messaging warning" "messaging warning" "WARN" $Error[0]
		LogMessage $msg
	}

}

# Register the event handler
Register-ObjectEvent -InputObject $watcher -EventName EventRecordWritten -Action $action | Out-Null

$watcher.Enabled = $true


try {
    # Wait indefinitely
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    # Clean up
	$watcher.Enabled = $false
	$watcher.Dispose()
	Unregister-Event -SourceIdentifier $watcher.EventRecordWritten
}