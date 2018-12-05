# Requirements

pip
- jinja2
- skimage

gem
- sass

# Overview

* all css dealing with colors is separated from css affecting layout
* techical aspects of color are discussed lightly in generate.py
* python uses jinja2 to generate a few scss files with transformed colors.
* scss generates the css

# Usage

update colors in generate.py / modify the template, then:

```
$ python3 generate.py
$ scss --update ./:../css
```
