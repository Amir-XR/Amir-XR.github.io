use strict;
use warnings;
local $/;

my $file = shift @ARGV or die "Usage: fix_project_pages.pl <file>\n";
open my $fh, '<', $file or die "Cannot open $file: $!";
my $txt = <$fh>;
close $fh;

# Basic path fixes for files inside /projects
$txt =~ s/<html lang="en">/<html lang="en" data-theme="dark">/g;
$txt =~ s/href="assets\/css\/style\.css"/href="..\/assets\/css\/style.css"/g;
$txt =~ s/src="assets\//src="..\/assets\//g;
$txt =~ s/<script src="assets\/js\/main\.js"><\/script>/<script src="..\/assets\/js\/main.js"><\/script>/g;
$txt =~ s/href="index\.html">Amir Goli/href="..\/index.html">Amir Goli/g;

# Replace the entire nav with relative links from /projects
$txt =~ s/<nav class="nav" data-nav>.*?<\/nav>/<nav class="nav" data-nav>\n          <a href="..\/index.html">Home<\/a>\n          <a href="..\/about.html">About<\/a>\n          <a href="..\/skills-honors.html">Skills &amp; Honors<\/a>\n          <a href="..\/publications.html">Publications<\/a>\n          <a href="index.html" aria-current="page">Projects<\/a>\n          <a href="..\/activities.html">Activities<\/a>\n          <a href="..\/contact.html">Contact<\/a>\n        <\/nav>/s;

# Theme label (default dark)
$txt =~ s/Mode: (Light|Gray)/Theme: Dark/g;

# In-page links
$txt =~ s/href="projects\.html"/href="index.html"/g;
$txt =~ s/href="publications\.html"/href="..\/publications.html"/g;
$txt =~ s/href="portfolio\.html"/href="index.html"/g;

# Replace Portfolio list item in "Links" sections if present
$txt =~ s/<li>\s*<a href="portfolio\.html">Portfolio entry<\/a>\s*<\/li>/<li><a href="index.html">Back to Projects<\/a><\/li>/g;

open my $out, '>', $file or die "Cannot write $file: $!";
print $out $txt;
close $out;
