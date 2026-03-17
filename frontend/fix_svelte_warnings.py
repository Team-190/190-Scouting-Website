import re

with open('src/pages/datapages/pickLists.svelte', 'r') as f:
    content = f.read()

# Replace on:dragover -> ondragover, on:drop -> ondrop etc. for simple cases
content = re.sub(r'on:click', 'onclick', content)
content = re.sub(r'on:dragover', 'ondragover', content)
content = re.sub(r'on:dragenter', 'ondragenter', content)
content = re.sub(r'on:dragstart', 'ondragstart', content)
content = re.sub(r'on:blur', 'onblur', content)
content = re.sub(r'on:keydown', 'onkeydown', content)
content = re.sub(r'on:focus', 'onfocus', content)

# Fix preventDefault
content = re.sub(r'on:drop\|preventDefault={([^}]+)}', r'ondrop={(e) => { e.preventDefault(); \1(e); }}', content)
content = re.sub(r'on:drop', 'ondrop', content)

# Fix a11y autofocus
content = re.sub(r'\s+autofocus', '', content)

# Fix a11y span with startEditing
content = re.sub(
    r'<span\s+onclick={\(\) =>\s+startEditing\(key, list\.name\)}\s*>{list\.name}</span\s*>',
    r'<span role="button" tabindex="0" onkeydown={(e) => e.key === "Enter" && startEditing(key, list.name)} onclick={() => startEditing(key, list.name)}>{list.name}</span>',
    content
)

# Fix a11y span with startEditingAllianceSelection
content = re.sub(
    r'<span\s+onclick={startEditingAllianceSelection}\s+title="Click to rename"\s*>',
    r'<span role="button" tabindex="0" onkeydown={(e) => e.key === "Enter" && startEditingAllianceSelection()} onclick={startEditingAllianceSelection} title="Click to rename">',
    content
)

# Fix a11y div sidebar-team
content = re.sub(
    r'<div\s+class="sidebar-team"\s+class:picked={\!\!pickedTeams\[\s*team\.team_number\s*\]}\s+draggable="true"\s+ondragstart={\(\) =>\s+handleDragStart\(\s*team,\s*key,?\s*\)}\s+onclick={\(\) =>\s+toggleTeamPicked\(\s*team\.team_number,?\s*\)}\s*>',
    r'<div role="button" tabindex="0" class="sidebar-team" class:picked={!!pickedTeams[team.team_number]} draggable="true" ondragstart={() => handleDragStart(team, key)} onclick={() => toggleTeamPicked(team.team_number)} onkeydown={(e) => e.key === "Enter" && toggleTeamPicked(team.team_number)}>',
    content
)

with open('src/pages/datapages/pickLists.svelte', 'w') as f:
    f.write(content)
