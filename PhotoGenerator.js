define([
    "jquery",
    "font_detect"
], function ($, FontDetect) {

    "use strict";

    /**
     *  Initialize photo generator by adding a photo object and optionally
     *  an options object hash.
     *
     *  @param {object} photo object
     *  @param {object} options
     */
    var PhotoGenerator = function (photo, options) {
        options = options || {};

        this._photo = photo;

        this._config = $.extend({}, {
            imageWidth: 375,
            imageHeight: 500,
            maxWidth: 120,
            inactiveMargin: 12,
            arrowSize: 6,
            borderColor: "rgba(153, 153, 153, 0.25)",
            backgroundColor: "rgba(255, 255, 255, 0.96)",
            horizontalSpacing: 10,
            verticalSpacing: 4,
            lineHeight: 15,
            fontFamily: "Open Sans",
            fontSize: 11,
            fontColor: "rgb(54, 54, 54)",
            brandWidth: 30,
            brandSpacing: 4,
            watermarkUrl: "https://media.fitbay.com/images/static/logo-transparent.png",
            watermarkWidth: 113,
            watermarkHeight: 51,
            imageProxyUrl: ""
        }, options);
    };

    PhotoGenerator.prototype = {};

    /**
     *  @public
     *  Initiate rendering of the photo added during initialization.
     *
     *  @param {object} options (retina: true/false)
     *  @returns {object} jQuery promise
     */
    PhotoGenerator.prototype.render = function (options) {
        options = options || {};

        //Determine whether to do retina or not
        delete this._retina;
        if (options.retina) {
            this._retina = true;
        }

        var promise = $.Deferred();

        var imgPromise = $.Deferred(),
            logoPromise = $.Deferred(),
            brandPromise = $.Deferred(),
            affiliatePromise = $.Deferred();

        $.when(imgPromise, logoPromise, brandPromise, affiliatePromise)
            .done($.proxy(function () {
                //Start creating the photo
                this._doCreate(promise);
            }, this))
            .fail(function () {
                throw new Error("An error occurred preparing resources for the photo.");
            });

        //Load the primary image and continue afterwards
        this._img = new Image();
        this._img.onload = function () {
            imgPromise.resolve();
        };
        //Select large version and fall back to original
        var image = this._photo.versions;
        this._img.src = this.ensureAllowedUrl(image.large ? image.large.url : image.original.url);

        //Load the logo
        this._logoImg = new Image();
        this._logoImg.onload = function () {
            //Indicate logo image ready
            logoPromise.resolve();
        };
        this._logoImg.src = this.ensureAllowedUrl(this._config.watermarkUrl);

        //Check for brand logo on a tag
        var brandPromises = [];
        this._photo.tags.forEach($.proxy(function (tag) {
            var promise = $.Deferred();
            brandPromises.push(promise);
            var logo = tag.product.brand.logo;
            if (logo) {
                //Load the affiliate image and continue afterwards
                var logoImg = new Image();
                logoImg.onload = function () {
                    //Indicate affiliate image ready
                    promise.resolve();
                };
                logoImg.src = this.ensureAllowedUrl(logo.url);
                //Save image on tag
                tag.product.brand.el = logoImg;
            }
            else {
                promise.resolve();
            }
        }, this));
        $.when.apply(this, brandPromises).done(function () {
            brandPromise.resolve();
        });

        //Check for affiliate image on a tag
        var affiliatePromises = [];
        this._photo.tags.forEach($.proxy(function (tag) {
            var promise = $.Deferred();
            affiliatePromises.push(promise);
            var image = tag.product.image;
            if (image) {
                //Load the affiliate image and continue afterwards
                var affiliateImg = new Image();
                affiliateImg.onload = function () {
                    //Indicate affiliate image ready
                    promise.resolve();
                };
                affiliateImg.src = this.ensureAllowedUrl(image.thumbnail ? image.thumbnail.url : image.original.url);
                //Save image on tag
                tag.product.image.el = affiliateImg;
            }
            else {
                promise.resolve();
            }
        }, this));
        $.when.apply(this, affiliatePromises).done(function () {
            affiliatePromise.resolve();
        });

        return promise;
    };

    /**
     *  @public
     *  Converts the created photo into a base64 encoded jpeg image. This should
     *  never be called before the render promise has resolved.
     *
     *  @returns {string} base64 encoded image data URL
     */
    PhotoGenerator.prototype.getImageUrl = function () {
        var imageUrl = this._canvas.toDataURL("image/jpeg");

        imageUrl = imageUrl.replace(/^data:image\/([a-z]+);base64,/, "");

        return imageUrl;
    };

    /**
     *  @private
     *  Takes an image URL and check whether domains match. If not, it puts the
     *  image behind a proxy.
     *
     *  @param {string} Image URL
     */
    PhotoGenerator.prototype.ensureAllowedUrl = function (url) {
        if (!url.match(new RegExp("^" + window.location.protocol + "//" + window.location.host, "i")) && this._config.imageProxyUrl) {
            url = this._config.imageProxyUrl + encodeURIComponent(btoa(url));
        }
        return url;
    };

    /**
     *  @private
     *  Takes a promise, creates the whole photo and resolves that promise.
     *
     *  @param {object} jQuery promise
     */
    PhotoGenerator.prototype._doCreate = function (promise) {
        this._width = this._config.imageWidth;
        this._height = this._config.imageHeight;

        this._constructCanvas();

        this._constructImage();

        this._constructWatermark();

        FontDetect.onFontLoaded(this._config.fontFamily, $.proxy(function () {
            this._doAddTags();

            promise.resolve();
        }, this));
    };

    /**
     *  @private
     *  Creates the canvas element going to contain the whole photo.
     */
    PhotoGenerator.prototype._constructCanvas = function () {
        var width = this._width * (this._retina ? 2 : 1),
            height = this._height * (this._retina ? 2 : 1);

        //Create canvas element
        this._canvas = document.createElement("canvas");
        this._canvas.setAttribute("id", "photo_generator");
        this._canvas.width = width;
        this._canvas.height = height;

        //Find context of canvas element
        this._context = this._canvas.getContext("2d");
    };

    /**
     *  @private
     *  Draws the image onto the canvas.
     */
    PhotoGenerator.prototype._constructImage = function () {
        var width = this._width * (this._retina ? 2 : 1),
            height = this._height * (this._retina ? 2 : 1);

        this._context.drawImage(this._img, 0, 0, width, height);
    };

    /**
     *  @private
     *  Draws the watermark logo onto the canvas.
     */
    PhotoGenerator.prototype._constructWatermark = function () {
        var width = this._config.watermarkWidth,
            height = this._config.watermarkHeight,
            offsetX = this._width - width - 20,
            offsetY = this._height - height - 10;

        if (this._retina) {
            offsetX *= 2;
            offsetY *= 2;
            width *= 2;
            height *= 2;
        }

        this._context.drawImage(this._logoImg, offsetX, offsetY, width, height);
    };

    /**
     *  @private
     *  Makes the calculations and draws each tag onto the canvas.
     */
    PhotoGenerator.prototype._doAddTags = function () {
        var inactive = this._config.inactiveMargin,
            arrowSize = this._config.arrowSize,
            bg = this._config.backgroundColor,
            border = this._config.borderColor,
            line = this._config.lineHeight;

        this._photo.tags.forEach($.proxy(function (tag) {
            var brand = tag.product.brand.name,
                size = tag.sizes.string,
                dimensions = this._calculcateDimensions(brand, size),
                direction = "south";

            var x = this._width * tag.position.tlc_x,
                y = this._height * tag.position.tlc_y,
                width = dimensions.width,
                height = dimensions.height;
            if (tag.product.brand.logo) {
                width += this._config.brandWidth + this._config.brandSpacing * 2;
            }
            if (tag.product.image) {
                width += height;
            }

            //Ensure coordinates stays within bounds
            if (x < inactive) {
                x = inactive;
            }
            else if (x > this._width - inactive) {
                x = this._width - inactive;
            }
            if (y < inactive) {
                y = inactive;
            }
            else if (y > this._height - inactive) {
                y = this._height - inactive;
            }

            //Set label position (ensure label stays within horizontal bounds)
            var labelX = x - width / 2,
                labelY = y + arrowSize - 1;
            if (labelX < inactive) {
                labelX = inactive;
            }
            else if (labelX > this._width - inactive - width / 2) {
                labelX = this._width - inactive - width / 2;
            }

            //Ensure arrow stays within label horizontally
            if (x < inactive * 2) {
                x = inactive * 2;
            }
            else if (x > this._width - inactive * 2) {
                x = this._width - inactive * 2;
            }

            //Check for label pushing past lower bounds (and if so flip north)
            if (labelY + height > this._height - inactive) {
                direction = "north";
                labelY = y - (arrowSize - 1) - height;
            }

            //Create label and arrow
            this._constructArrow(direction, x, y - 1, arrowSize, border);
            this._constructLabel(labelX, labelY, width, height, bg, border);
            this._constructArrow(direction, x, y, arrowSize - 1, bg);

            var labelSpacing = this._config.horizontalSpacing;
            //Add brand logo to tag
            if (tag.product.brand.logo) {
                this._context.save();
                //Use clip to cut corners off of affiliate image
                this._constructLabel(labelX, labelY, width, height);
                this._context.clip();
                this._constructBrandLogo(tag.product.brand.el, labelX, labelY, this._config.brandWidth, height, tag.product.brand.logo.prevail_hex);
                this._context.restore();
                //Clean up image element
                delete tag.product.brand.el;
                //Push spacing to allow place for image
                labelSpacing += this._config.brandWidth + this._config.brandSpacing * 2;

                //Add separator line
                this._constructSeparator(labelX + height, labelY, height);
            }
            //Add affiliate img to tag
            if (tag.product.image) {
                this._context.save();
                //Use clip to cut corners off of affiliate image
                this._constructLabel(labelX, labelY, width, height);
                this._context.clip();
                this._constructAffiliateImage(tag.product.image.el, labelX, labelY, height, width);
                this._context.restore();
                //Clean up image element
                delete tag.product.image.el;

                //Add separator line
                this._constructSeparator(labelX + (width - height), labelY, height);
            }

            //Create label text
            this._setFont({ bold: true });
            this._constructText(labelX + labelSpacing, labelY + line, brand);
            this._setFont();
            this._constructText(labelX + labelSpacing, labelY + line * 2, size);
        }, this));
    };

    /**
     *  @private
     *  Calculates dimensions for a tag based on lengths of text lines.
     *
     *  @param {string} text on line 1
     *  @param {string} text on line 2
     */
    PhotoGenerator.prototype._calculcateDimensions = function (line1, line2) {
        var maxWidth = this._config.maxWidth,
            hSpacing = this._config.horizontalSpacing,
            vSpacing = this._config.verticalSpacing,
            lineHeight = this._config.lineHeight;
        if (this._retina) {
            maxWidth *= 2;
            hSpacing *= 2;
            vSpacing *= 2;
            lineHeight *= 2;
        }

        //Determine width from text width
        var width = 0;
        this._setFont({ bold: true });
        width = Math.max(width, this._context.measureText(line1).width);
        this._setFont();
        width = Math.max(width, this._context.measureText(line2).width);
        if (width > maxWidth) {
            width = maxWidth;
        }
        width += hSpacing * 2;

        //Determine height
        var height = lineHeight * 2 + vSpacing * 2;

        //Account for retina
        if (this._retina) {
            width /= 2;
            height /= 2;
        }

        return {
            width: width,
            height: height
        };
    };

    /**
     *  @private
     *  Draws an arrow onto the canvas based on the label direction and
     *  coordinates with a specific size and color.
     *
     *  @param {string} direction of the label (north or south, default south)
     *  @param {integer} x coordinate
     *  @param {integer} y coordinate
     *  @param {integer} vertical size (horizontal is twice this)
     *  @param {string} color
     */
    PhotoGenerator.prototype._constructArrow = function (dir, x, y, size, c) {
        if (this._retina) {
            x *= 2;
            y *= 2;
            size *= 2;
        }

        //Flip arrow if north direction
        var wideY = y;
        if (dir === "north") {
            wideY -= size;
        }
        else {
            wideY += size;
        }

        this._context.beginPath();
        this._context.moveTo(x, y);
        this._context.lineTo(x + size, wideY);
        this._context.lineTo(x - size, wideY);
        this._context.lineTo(x, y);
        this._context.closePath();
        this._context.strokeStyle = c;
        this._context.stroke();
        this._context.fillStyle = c;
        this._context.fill();
    };

    /**
     *  @private
     *  Draws a label onto the canvas based on coordinates with a specific size,
     *  background color and border color.
     *
     *  @param {integer} x coordinate
     *  @param {integer} y coordinate
     *  @param {integer} width
     *  @param {integer} height
     *  @param {string} background color
     *  @param {string} border color
     */
    PhotoGenerator.prototype._constructLabel = function (x, y, w, h, bg, b) {
        var radius = 4;

        if (this._retina) {
            x *= 2;
            y *= 2;
            w *= 2;
            h *= 2;
            radius *= 2;
        }

        this._context.beginPath();
        this._context.moveTo(x + radius, y);
        this._context.lineTo(x + w - radius, y);
        this._context.quadraticCurveTo(x + w, y, x + w, y + radius);
        this._context.lineTo(x + w, y + h - radius);
        this._context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        this._context.lineTo(x + radius, y + h);
        this._context.quadraticCurveTo(x, y + h, x, y + h - radius);
        this._context.lineTo(x, y + radius);
        this._context.quadraticCurveTo(x, y, x + radius, y);
        this._context.closePath();
        if (b) {
            this._context.strokeStyle = b;
            this._context.stroke();
        }
        if (bg) {
            this._context.fillStyle = bg;
            this._context.fill();
        }
    };

    /**
     *  @private
     *  Draws a brand logo onto the canvas based on coordinates with a specific
     *  width.
     *
     *  @param {object} Image element
     *  @param {integer} x coordinate
     *  @param {integer} y coordinate
     *  @param {integer} width of the logo
     *  @param {integer} height of the label
     *  @param {string} prevailing color of logo in hex
     */
    PhotoGenerator.prototype._constructBrandLogo = function (img, x, y, width, labelHeight, prevailingColor) {
        var spacing = this._config.brandSpacing;

        if (this._retina) {
            x *= 2;
            y *= 2;
            width *= 2;
            labelHeight *= 2;
            spacing *= 2;
        }

        if (prevailingColor) {
            this._context.fillStyle = "#" + prevailingColor;
            this._context.fillRect(x, y, width + spacing * 2, labelHeight);
        }

        //Indent brand logo
        x += spacing;

        //Calculate brand logo height
        var height = Math.round(width / 190 * 150);

        var srcX = 0,
            srcY = 0,
            srcWidth = img.width,
            srcHeight = img.height;

        //Center logo vertically
        if (height < labelHeight) {
            y += (labelHeight - height) / 2;
        }

        this._context.drawImage(
            img,
            srcX, srcY,
            srcWidth, srcHeight,
            x, y,
            width, height
        );
    };

    /**
     *  @private
     *  Draws an affiliate image onto the canvas based on coordinates with a
     *  specific size.
     *
     *  @param {object} Image element
     *  @param {integer} x coordinate
     *  @param {integer} y coordinate
     *  @param {integer} size of the square image
     *  @param {integer} width of the label
     */
    PhotoGenerator.prototype._constructAffiliateImage = function (img, x, y, size, labelWidth) {
        if (this._retina) {
            x *= 2;
            y *= 2;
            size *= 2;
            labelWidth *= 2;
        }

        //Move affiliate image to the right of the label
        x += labelWidth - size;

        var srcX = 0,
            srcY = 0,
            srcWidth = img.width,
            srcHeight = img.height;

        if (srcWidth > srcHeight) {
            //Landscape
            srcX = (srcWidth - srcHeight) / 2;
            srcWidth = srcHeight;
        }
        else if (srcWidth < srcHeight) {
            //Portrait
            srcY = (srcHeight - srcWidth) / 2;
            srcHeight = srcWidth;
        }

        this._context.drawImage(
            img,
            srcX, srcY,
            srcWidth, srcHeight,
            x, y,
            size, size
        );
    };

    /**
     *  @private
     *  Draws a vertical separator line onto the canvas based on coordinates
     *  with a specific height. The separator is created with a gradient from
     *  transparent to black to trasparent with an opacity of 10.
     *
     *  @param {integer} x coordinate
     *  @param {integer} y coordinate
     *  @param {integer} height
     */
    PhotoGenerator.prototype._constructSeparator = function (x, y, height) {
        var width = 1;
        if (this._retina) {
            x *= 2;
            y *= 2;
            width *= 2;
            height *= 2;
        }

        this._context.lineWidth = width;

        var grad = this._context.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, "rgba(255, 255, 255, 0.1)");
        grad.addColorStop(0.5, "rgba(0, 0, 0, 0.1)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0.1)");

        this._context.strokeStyle = grad;

        this._context.beginPath();
        this._context.moveTo(x, y);
        this._context.lineTo(x, y + height);

        this._context.stroke();
    };

    /**
     *  @private
     *  Sets the font on the canvas. Used for both calculating the text sizes
     *  and for drawing the texts.
     *
     *  @param {object} options (bold: true/false)
     */
    PhotoGenerator.prototype._setFont = function (options) {
        options = options || {};

        var size = this._config.fontSize;
        if (this._retina) {
            size *= 2;
        }

        var font = size + "px " + this._config.fontFamily;
        if (options.bold) {
            font = "bold " + font;
        }

        this._context.font = font;
        this._context.fillStyle = this._config.fontColor;
    };

    /**
     *  @private
     *  Draws text onto the canvas based on coordinates. The text is cropped to
     *  stay within the maxWidth set upon initialization. If the text is
     *  cropped, three dots are added.
     *
     *  @param {integer} x coordinate
     *  @param {integer} y coordinate
     *  @param {string} text
     */
    PhotoGenerator.prototype._constructText = function (x, y, text) {
        var maxWidth = this._config.maxWidth;
        if (this._retina) {
            x *= 2;
            y *= 2;
            maxWidth *= 2;
        }

        //Crop text with ellipsis, if too long
        var output = text;
        if (this._context.measureText(output).width > maxWidth) {
            while (this._context.measureText(output + "...").width > maxWidth) {
                output = output.substring(0, output.length - 1);
            }
            output += "...";
        }

        this._context.fillText(output, x, y);
    };

    return PhotoGenerator;

});