import os
import math
import struct
import skimage.color as skcolor
import jinja2

def _hex2rgb(s):
   '''s is 6-character string for standard hex colors (no `#`)'''
   return struct.unpack('BBB', bytes.fromhex(s))

def _rgb2hex(rgb):
   '''rgb is list [r, g, b]'''
   return bytes.hex(struct.pack('BBB', *rgb))

def _hex2lab(s):
   '''s is 6-character string for standard hex colors (no `#`)'''
   return skcolor.rgb2lab([[[x / 255 for x in _hex2rgb(s)]]])[0][0]

def _lab2hex(lab):
   '''lab is list [l, a, b]'''
   return _rgb2hex([int(x) for x in (skcolor.lab2rgb([[lab]])[0][0] * 255)])

def _hexable(lab):
   '''lab is valid hex value'''
   new_lab = _hex2lab(_lab2hex(lab))
   val = sum([(new_lab[i] - lab[i]) ** 2 for i in [0, 1, 2]]) < 1
   return val

def _saturate(lab):
   '''
   get maximum saturated lab values at this l, along the same radius
   in the ab plane
   '''
   l, a, b = lab

   phi = math.atan2(b, a)

   test = [
      l,
      127 * math.sqrt(2) * math.cos(phi),
      127 * math.sqrt(2) * math.sin(phi)
   ]

   # binary search
   for i in range(13):
      if _hexable(test):
         test[1] += test[1] / 2
         test[2] += test[2] / 2
      else:
         test[1] -= test[1] / 2
         test[2] -= test[2] / 2

   return test

###############################################################################

# TMZ - yet another parameterization of color:
# (scaling of CIELAB space in cylindrical coords, but using manhattan distance,
#  so not actually a cylinder)
# T - theta, M - Manhattan distance, Z - 3rd dimension
#
#                 point in question
#
# Yellow    1|     0 <-boundary point (maximally saturated color
#            |                           resolvable to hex at this T, Z)
#         B >|--0 <- point of interest
#            | /
#            |/)<-T              Let l, a, b be coordinates in CIELAB
# -----------+-----------        and T, M, Z be coordinates in TMZ
# -1         |  ^       1        l is in [0, 100]; a and b are in [-127, 127]
#            |  A
#            |                   We have A = a / 127; B = b / 127
# Blue       |                   # T = arctan2(B, A)           [-pi, pi]
#   Green  -1|          Red      # M = (abs(A) + abs(B)) / 2      [0, 1]
###########################      # Z = l / 100.                   [0, 1]

def _hex2tmz(s):
   l, a, b = _hex2lab(s)
   t = math.atan2(b, a)
   m = (abs(a) + abs(b)) / 255.
   z = l / 100.

   return t, m, z

def _tmz2hex(tmz):
   '''tmz as [t, m, z]'''
   t, m, z = tmz

   c = math.cos(t)
   s = math.sin(t)

   bnd_lab = _saturate([z * 100., c, s])
   bnd_m = (abs(bnd_lab[1]) + abs(bnd_lab[2])) / 255.

   r = 2 * min(m, bnd_m) / (abs(c) + abs(s))

   return _lab2hex([z * 100., c * r * 127., s * r * 127.])


# public methods on hex colors which make reference to CIELAB/TMZ space
##############################################################################

def rotate(s, deg):
   '''
   rotate hue while preserving luminosity by angle in CIELAB's (a, b) plane
   '''
   t, m, z = _hex2tmz(s)
   t += deg / 180 * math.pi
   return _tmz2hex([t, m, z])

def reflect(s, axis_angle):
   '''
   reflect hue about an axis in ab plane
   '''
   t, m, z = _hex2tmz(s)
   t = (2 * axis_angle) - t
   return _tmz2hex([t, m, z])

def project(s, axis_angle):
   '''
   project color along a line with angle `axis_angle` in (a, b) plane
   '''
   t, m, z = _hex2tmz(s)
   m = m * math.cos(t - axis_angle)
   t = axis_angle
   return _tmz2hex([t, m, z])

def grey(s):
   '''
   eliminate color information (project to origin in (a, b) plane)
   '''
   t, m, z = _hex2tmz(s)
   m = 0
   return _tmz2hex([t, m, z])

def invert_luma(s):
   '''
   invert luminosity
   '''
   t, m, z= _hex2tmz(s)
   return _tmz2hex([t, m, 1. - z])

# Compositions must be peformed together, or we might lose saturation
# at an intermediate step

def invert_rotate(s, deg):
   '''
   rotate hue while preserving luminosity by angle in CIELAB's (a, b) plane
   '''
   t, m, z = _hex2tmz(s)
   t += deg / 180 * math.pi
   return _tmz2hex([t, m, 1. - z])

def invert_reflect(s, axis_angle):
   '''
   reflect hue about an axis
   '''
   t, m, z = _hex2tmz(s)
   t = (2 * axis_angle) - t
   return _tmz2hex([t, m, 1. - z])

def invert_project(s, axis_angle):
   '''
   project color along a line with angle `axis_angle` in (a, b) plane
   '''
   t, m, z = _hex2tmz(s)
   m = m * math.cos(t - axis_angle)
   t = axis_angle
   return _tmz2hex([t, m, 1. - z])

###############################################################################

variables = {
    "color_base":           "b2b2b2",
    "color_emph":           "cccccc",
    "color_comment":        "2aa1ae",
    "color_link":           "409b9b",
    "color_const":          "a45bad",
    "color_code":           "bababa",
    "color_cursor":         "b1951d",
    "color_strong":         "df5e8c",
    "color_func":           "bc6ec5",
    "color_h1":             "4f97d7",
    "color_h2":             "2d9574",
    "color_h3":             "67b11d",
    "color_h4":             "b1951d",
    "color_str":            "2d9574",
    "color_blockquote":     "a2b2d2",
    "color_blockquote_bar": "3b3b3b",
    "color_bg_main":        "222222",
    "color_bg_alt":         "272727",
    "color_bg_pre":         "191919",
    "color_bg_code":        "2e2e2e",
    "highlight_err_c":      "960050",
    "highlight_err_bg":     "1e0010",
    "highlight_hll":        "49483e",
    "highlight_bg":         "272822",
    "highlight_cl":         "f8f8f2",  #* Comment */
    "highlight_c":          "75715e",  #* Keyword */
    "highlight_k":          "66d9ef",  #* Literal */
    "highlight_l":          "ae81ff",  #* Name */
    "highlight_n":          "f8f8f2",  #* Operator */
    "highlight_o":          "f92672",  #* Punctuation */
    "highlight_p":          "f8f8f2",  #* Comment.Hashbang */
    "highlight_ch":         "75715e",  #* Comment.Multiline */
    "highlight_cm":         "75715e",  #* Comment.Preproc */
    "highlight_cp":         "75715e",  #* Comment.PreprocFile */
    "highlight_cpf":        "75715e",  #* Comment.Single */
    "highlight_c1":         "75715e",  #* Comment.Special */
    "highlight_cs":         "75715e",  #* Generic.Deleted */
    "highlight_gd":         "f92672",  #* Generic.Inserted */
    "highlight_gi":         "a6e22e",  #* Generic.Subheading */
    "highlight_gu":         "75715e",  #* Keyword.Constant */
    "highlight_kc":         "66d9ef",  #* Keyword.Declaration */
    "highlight_kd":         "66d9ef",  #* Keyword.Namespace */
    "highlight_kn":         "f92672",  #* Keyword.Pseudo */
    "highlight_kp":         "66d9ef",  #* Keyword.Reserved */
    "highlight_kr":         "66d9ef",  #* Keyword.Type */
    "highlight_kt":         "66d9ef",  #* Literal.Date */
    "highlight_ld":         "e6db74",  #* Literal.Number */
    "highlight_m":          "ae81ff",  #* Literal.String */
    "highlight_s":          "e6db74",  #* Name.Attribute */
    "highlight_na":         "a6e22e",  #* Name.Builtin */
    "highlight_nb":         "f8f8f2",  #* Name.Class */
    "highlight_nc":         "a6e22e",  #* Name.Constant */
    "highlight_no":         "66d9ef",  #* Name.Decorator */
    "highlight_nd":         "a6e22e",  #* Name.Entity */
    "highlight_ni":         "f8f8f2",  #* Name.Exception */
    "highlight_ne":         "a6e22e",  #* Name.Function */
    "highlight_nf":         "a6e22e",  #* Name.Label */
    "highlight_nl":         "f8f8f2",  #* Name.Namespace */
    "highlight_nn":         "f8f8f2",  #* Name.Other */
    "highlight_nx":         "a6e22e",  #* Name.Property */
    "highlight_py":         "f8f8f2",  #* Name.Tag */
    "highlight_nt":         "f92672",  #* Name.Variable */
    "highlight_nv":         "f8f8f2",  #* Operator.Word */
    "highlight_ow":         "f92672",  #* Text.Whitespace */
    "highlight_w":          "f8f8f2",  #* Literal.Number.Bin */
    "highlight_mb":         "ae81ff",  #* Literal.Number.Float */
    "highlight_mf":         "ae81ff",  #* Literal.Number.Hex */
    "highlight_mh":         "ae81ff",  #* Literal.Number.Integer */
    "highlight_mi":         "ae81ff",  #* Literal.Number.Oct */
    "highlight_mo":         "ae81ff",  #* Literal.String.Affix */
    "highlight_sa":         "e6db74",  #* Literal.String.Backtick */
    "highlight_sb":         "e6db74",  #* Literal.String.Char */
    "highlight_sc":         "e6db74",  #* Literal.String.Delimiter */
    "highlight_dl":         "e6db74",  #* Literal.String.Doc */
    "highlight_sd":         "e6db74",  #* Literal.String.Double */
    "highlight_s2":         "e6db74",  #* Literal.String.Escape */
    "highlight_se":         "ae81ff",  #* Literal.String.Heredoc */
    "highlight_sh":         "e6db74",  #* Literal.String.Interpol */
    "highlight_si":         "e6db74",  #* Literal.String.Other */
    "highlight_sx":         "e6db74",  #* Literal.String.Regex */
    "highlight_sr":         "e6db74",  #* Literal.String.Single */
    "highlight_s1":         "e6db74",  #* Literal.String.Symbol */
    "highlight_ss":         "e6db74",  #* Name.Builtin.Pseudo */
    "highlight_bp":         "f8f8f2",  #* Name.Function.Magic */
    "highlight_fm":         "a6e22e",  #* Name.Variable.Class */
    "highlight_vc":         "f8f8f2",  #* Name.Variable.Global */
    "highlight_vg":         "f8f8f2",  #* Name.Variable.Instance */
    "highlight_vi":         "f8f8f2",  #* Name.Variable.Magic */
    "highlight_vm":         "f8f8f2",  #* Literal.Number.Integer.Long */
    "highlight_il":         "ae81ff"
}


def write_with_func(name, func):
    print('writing', name + '.scss')

    with open(name + '.scss', 'w') as f:

        with open('color.scss.template') as t:
            x = jinja2.Template(t.read())

        f.write(
            x.render(**{
                k: func(v) \
                for k, v in variables.items() \
            })
        )

if __name__ == '__main__':
    write_with_func(
        'color-dark-default', lambda x: x
    )
    write_with_func(
        'color-dark-rotated', lambda x: rotate(x, 90)
    )
    write_with_func(
        'color-light-default', lambda x: invert_luma(x)
    )
    write_with_func(
        'color-light-rotated', lambda x: invert_rotate(x, 90)
    )
