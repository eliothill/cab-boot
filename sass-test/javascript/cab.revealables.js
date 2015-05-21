/**
 * CAB.revealables
 *
 * For the "revealable" forms - clicking radio buttons and checkboxes which
 * reveal and/or hide other elements.
 *
 * When a radio/checkbox is clicked, and has a data-reveals attribute,
 * then show/hide the related .js-revealable element.
 * The .js-revealable element should also have a class like
 * .js-revealable-unique-id and the input's data-reveal's attribute will
 * then be like data-reveals="unique-id".
 *
 * Or they can have mutiple, space-separated names:
 *  data-reveals="name-1 name-2"
 * would reveal .js-revealable-name-1 and .js-revealable-name2.
 *
 * The same goes for data-hides="".
 */
;(function() {
    'use strict';
    window.CAB = window.CAB || {};
    var $ = window.jQuery;

    CAB.revealables = {

        /**
         * Will have keys of the names of revealables, with True as the value
         * if that revealable is currently opening or closing.
         * Because we can get a race condition if clicking a revealer quickly.
         * So we want to know if one is currently in the process of moving,
         * so that we don't try and start it again.
         */
        currentlyMoving: {},

        /**
         * Should be called on page load.
         * I imagine these selectors are pretty inefficient, but we'll cross
         * that bridge when we come to it.
         *
         * @param <object> spec
         */
        init: function(spec) {
            // To ensure tests, in particular, don't get confused.
            this.currentlyMoving = {};

            this.initFromUrl();

            this.initRevealablesContainingErrors();

            var that = this;

            // When clicking a radio button, reveal its revealables, and hide
            // its hideables.
            $('body').on('click', 'input:radio[data-reveals]', function(){
                that.revealRadioRevealables($(this));
            });
            $('body').on('click', 'input:radio[data-hides]', function(){
                that.hideRadioHideables($(this));
            });

            // We reveal or hide a checkbox's revealables depending on whether
            // this checkbox is now checked or unchecked.

            // THIS wasn't working on some checkboxes.
            // eg, on /elements/revealables/, the Complicated Example, the
            // checkboxes within Animal > 4 legs.
            //$('body').on('click', 'input:checkbox[data-reveals]', function(){
                //that.doCheckboxRevealables($(this));
            //});
            // BUT THIS does work for that... Hmm.
            $('input:checkbox[data-reveals]').on('click', function(){
                that.doCheckboxRevealables($(this));
            });

            // When clicking an anchor, reveal its revealables, and hide its
            // hideables.
            // (The .off() was required to make some tests pass...)
            $('body').off('click', 'a[data-reveals]')
                        .on('click', 'a[data-reveals]', function(ev){
                            ev.preventDefault();
                            that.revealAnchorRevealables($(this));
                        });

            $('body').on('click', 'a[data-hides]', function(ev){
                ev.preventDefault();
                that.hideAnchorHideables($(this));
            });
        },

        /*********************************************************************
         * Opening revealables on page load.
         */

        /**
         * If any revealable element contains something that has an error,
         * (eg, after a failed form submission) we need to open that
         * revealable, AND all its revealable parents (or else it won't be
         * visible).
         */
        initRevealablesContainingErrors: function() {
            var toReveal = [],
                that = this;

            $('.js-revealable .has-error').each(function(idx){
                $(this).parents('.js-revealable').each(function(idx) {
                    var revealableName = that.getRevealableName($(this));
                    if (revealableName && toReveal.indexOf(revealableName) < 0) {
                        toReveal.push(revealableName);
                    };
                });
            });

            this.revealElements(toReveal);
        },

        /**
         * If there's a #hash in the URL that matches an HTML id on a
         * revealable element (ie, an element with .js-revealable class),
         * open that revealable. And, if it's within a further revealable,
         * open that too.
         */
        initFromUrl: function() {
            if ( ! this.getHash()) {
                return;
            }

            var hash = this.getHash().substring(1),
                $revealable = $('#'+hash+'.js-revealable').first();

            if ($revealable.length == 1) {
                // Get the element that opens the revealable.
                var $revealer = this.getRevealerFromRevealable($revealable);

                // If the revealable is within another revealable, we'll have
                // to open that too, so we can see the original.
                // We only go up one level; should be enough for now...
                var $parentRevealable = $revealer.parents('.js-revealable').first();
                if ($parentRevealable.length == 1) {
                    var $parentRevealer = this.getRevealerFromRevealable($parentRevealable);

                    if ($parentRevealer) {
                        this.revealAnyRevealables($parentRevealer);
                    };
                };

                this.revealAnyRevealables($revealer);
            };
        },

        /**
         * Makes it easier for testing, so we can stub this method.
         */
        getHash: function() {
            return window.location.hash;
        },

        /**
         * Given a .js-revealable element, find the anchor/input that opens it.
         * @param <jQuery> The revealable element.
         * @returns <Mixed> Either the revealer jQuery element or false.
         */
        getRevealerFromRevealable: function($revealable) {
            var $revealer = false,
                revealableName = this.getRevealableName($revealable);

            if (revealableName) {
                $revealer = $('*[data-reveals="'+revealableName+'"]').first();
            };

            if ($revealer && $revealer.length > 0) {
                return $revealer;
            } else {
                return false;
            };
        },

        /**
         * For a revealable element, get its "name".
         * ie, if it has classes like:
         *  "js-revealable js-revealable-my-widget foo-bar"
         * this returns "my-widget".
         * @param <jQuery> $revealable
         * @return <Mixed> Either the name string or boolean false.
         */
        getRevealableName: function($revealable) {
            var classes = $revealable.attr('class').split(' '),
                          revealableName = false;

            $.each(classes, function(idx, clss){
                // Find the revealable's class that indicates its
                // revealable name. (eg, "js-revealable-stage-1")
                if (clss.indexOf('js-revealable-') === 0) {
                    // Get the "stage-1" bit from "js-revealable-stage-1".
                    revealableName = clss.substring(14);
                    // Stop loop.
                    return false;
                };
            });

            return revealableName;
        },

        /**
         * Pass an element in, that should be an anchor, radio or checkbox,
         * and this will call the appropriate method to open its revealables.
         * @param <jQuery> $el
         */
        revealAnyRevealables: function($el) {
            if ($el.prop('tagName') == 'A') {
                this.revealAnchorRevealables($el);
            } else if ($el.prop('tagName') == 'INPUT') {
                if ($el.attr('type') == 'radio') {
                    this.revealRadioRevealables($el);
                } else if ($el.attr('type') == 'checkbox') {
                    this.revealCheckboxRevealables($el);
                };
            };
        },

        /*********************************************************************
         * Radio buttons.
         */

        /**
         * Reveals relevant 'revealable' blocks, related to a radio button.
         * (Try saying that quickly.)
         *
         * @param <JQuery> $input The radio input.
         */
        revealRadioRevealables: function($input) {
            var toReveal = this.getRevealables($input);
            // First, close any open revealables that were opened by radio
            // buttons in the same set.

            // Get all the radio buttons in the same set.
            var $siblings = $('input[name="'+$input.attr('name')+'"]');

            var that = this;

            // Make a list of all the revealables from radios in this set,
            // which aren't ones we want to reveal (to save hiding and then
            // revealing them).
            var allToHide = [];
            $siblings.each(function(idx){
                var toHide = that.getRevealables($(this));
                $.each(toHide, function(idx2, hideName){
                    if (allToHide.indexOf(hideName) === -1
                        &&
                        toReveal.indexOf(hideName) === -1) {

                        allToHide.push(hideName);
                    };
                });
            });

            this.hideElements(allToHide);
            this.revealElements(toReveal);
        },

        /**
         * Hides relevant 'hideable' blocks, related to a radio button.
         * ie, those mentioned in a data-hides="" attribute.
         *
         * @param <JQuery> $input The radio input.
         */
        hideRadioHideables: function($input) {
            var toHide = this.getHideables($input);
            this.hideElements(toHide);
        },

        /*********************************************************************
         * Checkboxes.
         */

        /**
         * Reveals relevant 'revealable' blocks, related to a checkbox.
         *
         * @param <JQuery> $input The checkbox input.
         */
        doCheckboxRevealables: function($input) {
            if ($input.is(':checked')) {
                var toReveal = this.getRevealables($input);
                // Reveal the relevant revealable.
                this.revealElements(toReveal);
            } else {
                 this.closeCheckboxRevealables($input);
            };
        },

        /**
         * For an input, that is UNchecked, hide its revealable, but ONLY
         * if all the other checkboxes associated with it are also unchecked.
         *
         * @param <JQuery> $input The radio or checkbox input.
         */
        closeCheckboxRevealables: function($input) {
            var allToHide = this.getRevealables($input);

            var that = this;

            // We've just unchecked, so hide the revealable.
            // Unless at least one of the other checked checkboxes in this set
            // reveals the same element.
            var $siblings = $('input[name="'+$input.attr('name')+'"]:checked');
            $siblings.each(function(i){
                var toHide = that.getRevealables($(this));
                $.each(toHide, function(n, hideName){
                    var index = allToHide.indexOf(hideName);
                    if (index > -1) {
                        allToHide.splice(index, 1);
                    };
                });
            });
            this.hideElements(allToHide);
        },

        /*********************************************************************
         * Anchors.
         */

        /**
         * When an anchor with a data-reveals attribute is clicked, open any
         * of its revealables if they're currently hidden, or hide them if
         * they're currently visible.
         *
         * @param <JQuery> $anchor The clicked anchor.
         */
        revealAnchorRevealables: function($anchor) {
            var revealables = this.getRevealables($anchor),
                toReveal = [],
                toHide = [];

            $.each(revealables, function(idx, name) {
                if ($('.js-revealable-'+name).is(':visible')) {
                    toHide.push(name);
                } else {
                    toReveal.push(name);
                };
            });

            this.revealElements(toReveal, this.anchorCallback, {anchor: $anchor});
            this.hideElements(toHide, this.anchorCallback,
                                            {anchor: $anchor, hidden: toHide});
        },

        /**
         * When an anchor with a data-hides attribute is clicked, hide any
         * of its hideables.
         *
         * @param <JQuery> $anchor The clicked anchor.
         */
        hideAnchorHideables: function($anchor) {
            var toHide = this.getHideables($anchor);
            this.hideElements(toHide, this.anchorCallback,
                                            {anchor: $anchor, hidden: toHide});
        },

        /**
         * Called when open/close is finished.
         * Sets the orientation of the anchor's icon, and scrolls the page so
         * that the anchor is at the top.
         *
         * Note that the scrolling is particularly useful when we open a
         * revealable due to the URL's #hash.
         *
         * @param <Object> Should have an 'anchor' element that contains
         *      the jQuery anchor object that was clicked.
         *      Might also have a 'hidden' element, which would be an array of
         *      the names of elements that were hidden.
         */
        anchorCallback: function(args) {
            // If the anchor that was clicked has an icon, turn it the other
            // way up.
            $('.fa', args.anchor).toggleClass('fa-chevron-up fa-chevron-down');

            if (args.hidden) {
                // For each of the hidden elements, find any anchor that would
                // reveal it, and turn the icon over.
                // This is for the 'close this content' links, for which we
                // need to turn the icons of their revealers over.
                $.each(args.hidden, function(idx, name){
                    // Don't do the anchor we've already done:
                    if (name !== args.anchor.data('reveals')) {
                        $('.fa', $('a[data-reveals="'+name+'"]'))
                                .toggleClass('fa-chevron-up fa-chevron-down');
                    };
                });
            };

            // If this is a collapsible menu or box, as opposed to a standard
            // in-page revealable, we don't want to scroll to it.
            if ( ! args.anchor.hasClass('revealer--menu')
                   &&
                ! args.anchor.hasClass('revealer--box')
                ) {
                $('html, body').animate({
                    scrollTop: args.anchor.offset().top
                }, 300);
            };
        },

        /*********************************************************************
         * General utility methods used by radios, checkboxes and anchors.
         */

        /**
         * Get all the revealable names from an element, as an array.
         * Returns an empty array if the element has none.
         * @param <JQuery> $el The element.
         */
        getRevealables: function($el) {
            return this.getNames($el, 'reveals');
        },

        /**
         * Get all the hideable names from an element, as an array.
         * Returns an empty array if the element has none.
         * @param <JQuery> $el The element.
         */
        getHideables: function($el) {
            return this.getNames($el, 'hides');
        },

        /**
         * Get all the revealable/hideable names from an element (eg, an anchor
         * or input), as an array.
         * Returns an empty array if the element has none.
         * @param <JQuery> $el The element.
         * @param <String> kind Either 'reveals' or 'hides'.
         */
        getNames: function($el, kind) {
            if (kind !== 'reveals' && kind !== 'hides') {
                return [];
            };
            var names = $el.data(kind);
            if (names) {
                names = names.split(' ');
            } else {
                names = [];
            };
            for (var i = 0; i < names.length; ++i) {
                names[i] = $.trim(names[i]);
            };
            return names;
        },

        /**
         * Reveal several elements.
         * @param <Array> elements An array of names of elements to reveal.
         * @param <requestCallback> Optional callback for after each reveal.
         * @param <Object> Optional object that will be passed to cb().
         */
        revealElements: function(elements, cb, cbArgs) {
            var that = this;
            $.each(elements, function(idx, name) {
                that.revealElement(name, cb, cbArgs);
            });
        },

        /**
         * Hide several elements.
         * @param <Array> elements An array of names of elements to hide.
         * @param <requestCallback> Optional callback for after each reveal.
         * @param <Object> Optional object that will be passed to cb().
         */
        hideElements: function(elements, cb, cbArgs) {
            var that = this;
            $.each(elements, function(idx, name) {
                that.hideElement(name, cb, cbArgs);
            });
        },

        /**
         * Rather hacky... don't want to do slideDown() on span's,
         * because then they'll be set to inline-block, instead of
         * inline.
         * @param <string> name The name of the element to reveal.
         * @param <requestCallback> Optional callback for after reveal is done.
         * @param <Object> Optional object that will be passed to cb().
         */
        revealElement: function(name, cb, cbArgs) {
            if (this.isCurrentlyMoving(name)) {
                return;
            };

            var $el = $('.js-revealable-'+name);

            this.currentlyMoving[name] = true;

            var that = this;

            if ($el.is('span')) {
                $el.fadeIn(function(){
                    that.movementFinished(name, 'revealed', cb, cbArgs);
                });
            } else {
                $el.slideDown(function(){
                    that.movementFinished(name, 'revealed', cb, cbArgs);
                });
            };
        },

        /**
         * To be consistent with revealElement().
         * @param <string> name The name of the element to hide.
         * @param <requestCallback> Optional callback for after hide is done.
         * @param <Object> Optional object that will be passed to cb().
         */
        hideElement: function(name, cb, cbArgs) {
            if (this.isCurrentlyMoving(name)) {
                return;
            };

            var $el = $('.js-revealable-'+name);

            // We want to hide it if it's visible
            // OR
            // if it's "visible" but within something that's not visible.
            if ($el.is(':visible') || ($el.is(':hidden') && $el.css('display') != 'none')) {
                this.currentlyMoving[name] = true;

                var that = this;

                if ($el.is('span')) {
                    $el.fadeOut(function(){
                        that.movementFinished(name, 'hidden', cb, cbArgs);
                    });
                } else {
                    $el.slideUp(function(){
                        that.movementFinished(name, 'hidden', cb, cbArgs);
                    });
                };
            };
        },

        /**
         * Called when any opening/closing/fading action on a revealable is
         * finished.
         *
         * @param <string> name The name of the revealable element.
         * @param <strong> action Was the element was 'revealed' or 'hidden'?
         * @param <requestCallback> Optional callback for when movement's done.
         * @param <Object> Optional object that will be passed to cb().
         */
        movementFinished: function(name, action, cb, cbArgs) {
            this.currentlyMoving[name] = false;
            if (action == 'revealed') {
                $('.js-revealable-'+name).attr('aria-expanded', 'true');
            } else {
                $('.js-revealable-'+name).attr('aria-expanded', 'false');
            };
            typeof cb === 'function' && cb(cbArgs);
        },

        /**
         * Is this element currently opening or closing?
         * @param <string> name The name of the element.
         * @return <boolean>
         */
        isCurrentlyMoving: function(name) {
            if (name in this.currentlyMoving && this.currentlyMoving[name] === true) {
                return true;
            } else {
                return false;
            };
        }
    };
}());
