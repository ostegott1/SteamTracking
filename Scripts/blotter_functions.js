
g_BlotterNextLoadURL = null;

function StartLoadingBlotter( url )
{
	g_BlotterNextLoadURL = null;	// clear this so we don't start loading again

	new Effect.Appear('blotter_throbber', {duration: .50});

	new Ajax.Request( url, {
		insertion: Insertion.Bottom,
		method: 'get',
		onSuccess: function(transport) {
			RecordAJAXPageView( transport.request.url );

			// load more data
			var response = transport.responseJSON;
			if ( response && response.success == true && response.blotter_html )
			{
				// append the new day, having it fade in quickly
				var newDiv = new Element ( 'div' );
				newDiv.update( response.blotter_html );
				newDiv.setOpacity(0);
				$('blotter_content').appendChild( newDiv );
				new Effect.Appear( newDiv, { duration: .75 }  );

				g_BlotterNextLoadURL = response.next_request;
				Blotter_InfiniteScrollingCheckForMoreContent();
			}
			else if ( !response )
			{
				// print out any error for now
				$('blotter_content').insert( { bottom: transport.responseText } );
			}

			$('blotter_throbber').hide();
		}
	});
}

// look to see if we have more content to get
function Blotter_InfiniteScrollingCheckForMoreContent()
{
	if ( !g_BlotterNextLoadURL )
		return;

	var viewport = document.viewport.getDimensions(); // Gets the viewport as an object literal
	var windowHeight = viewport.height; // Usable window height

	var scrollOffset = document.viewport.getScrollOffsets();
	var scrollTop = scrollOffset.top;

	var bodyHeight = $('blotter_content').getHeight();

	// number of pixels from the bottom before checking for more content
	// this should be about two rows of content
	var buffer = 200;
	if ( scrollTop + buffer > bodyHeight - windowHeight )
	{
		StartLoadingBlotter( g_BlotterNextLoadURL );
	}
}

// this holds the set of galleries on the blotter, which in turn hold screenshots
g_BlotterGalleries = {};

// switched between different screenshots in the gallery
function Blotter_SelectScreenshot( galleryid, screenshotid, spoiler )
{
	var gallery = g_BlotterGalleries[galleryid];

	$('ratingcontrols_ss_' + gallery.m_screenshotActive).hide();

	$('commentthread_ss_' + gallery.m_screenshotActive).hide();
	var effect = new Effect.Appear('ssfs_overlay_' + galleryid, {duration: 0.5});

	gallery.m_screenshotActive = screenshotid;

	var ss = gallery.shots[screenshotid];

	// update the big image
	var ssid = 'ss_' + galleryid;
	$(ssid).setAttribute( 'src', ss.m_img ? ss.m_img : ss.m_src );
	$(ssid).onload = (function(galleryid, effect){
		return function() {
			effect.cancel();
			$('ssfs_overlay_' + galleryid).hide();
		}
	})(galleryid, effect);

	// caption
	$('title_' + galleryid).innerHTML = ss.m_caption;

	// switch in the new comments
	$('ratingcontrols_ss_' + gallery.m_screenshotActive).show();

	$('commentthread_ss_' + screenshotid).show();

	// hide/show the lots of comments link
	if ( ss.m_commentCount > 3 )
		$('comment_showall_' + screenshotid).show();
	else
		$('comment_showall_' + screenshotid).hide();


	gallery.m_bSpoilerSelected = spoiler;
	if ( gallery.m_bSpoilerSelected )
		ShowSpoilerCover( galleryid );
	else
		HideSpoilerCover( galleryid )

	//!! turn on the loading image

	// turn off the border in all the other images
	for( var ss in gallery.shots )
	{
		ssid = 'ss_' + galleryid + '_' + gallery.shots[ss].m_id;
		$(ssid).setAttribute( 'class', 'blotter_screenshot_gallery_image' );
	}

	// turn on the border for the selected image
	ssid = 'ss_' + galleryid + '_' + screenshotid;
	$(ssid).setAttribute( 'class', 'blotter_screenshot_gallery_image_selected' );
}

function Blotter_ShowLargeScreenshot( galleryid, showComments )
{
	var gallery = g_BlotterGalleries[galleryid];
	var ss = gallery.shots[gallery.m_screenshotActive];
	ShowModalContent( ss.m_modalContentLink + '&insideModal=1&showComments=' + showComments, ss.m_modalContentLinkText, ss.m_modalContentLink, true );
}

function Blotter_ScreenshotLoaded( galleryid )
{
	// hide the loading image

}

function Blotter_MakeScreenshotFullScreen( galleryid )
{
	// get the gallery and the current image
	var gallery = g_BlotterGalleries[galleryid];

	// make sure all the existing ones are hidden
	for( var ss in gallery.shots )
	{
		$('ssfs_img_' + galleryid + '_' + ss).hide();
	}

	var ss = gallery.shots[gallery.m_screenshotActive];

	if ( requestFullScreen( $('ssfs_' + galleryid) ) )
	{
		var ssid = 'ssfs_img_' + galleryid + '_' + ss.m_id;

		// remove the resize part of the url, we'll just get the native
		var imgurl = ss.m_img.replace( /\/[^\/]*$/, '/' );
		// set to be the high-res
		$(ssid).src = imgurl;
		$(ssid).show();
	}

	return false;
}

function Blotter_NextScreenshotOrExit( galleryid )
{
	var gallery = g_BlotterGalleries[galleryid];
	$('ssfs_img_' + galleryid + '_' + gallery.m_screenshotActive).hide();

	var getNext = false;
	var ssNext = null;
	for( var ss in gallery.shots )
	{
		if ( getNext )
		{
			ssNext = ss;
			break;
		}

		if ( ss == gallery.m_screenshotActive )
			getNext = true;
	}

	if ( ssNext == null )
	{
		// set the shot to be the first one again, then exit
		var count = 0;
		for( var ss in gallery.shots )
		{
			if ( ssNext == null )
				ssNext = ss;
			count++;
			if ( count > 1 )
				break;
		}
		if ( count > 1 )
			Blotter_SelectScreenshot( galleryid, ssNext );

		exitFullScreen();
	}
	else
	{
		var ssid = 'ssfs_img_' + galleryid + '_' + ssNext;

		// remove the resize part of the url, we'll just get the native
		var imgurl = gallery.shots[ssNext].m_img.replace( /\/[^\/]*$/, '/' );
		$(ssid).src = imgurl;
		$(ssid).show();

		// set the gallery item as well
		Blotter_SelectScreenshot( galleryid, ssNext );

		// preload
		Blotter_PreloadNextScreenshot( galleryid );
	}
}

function Blotter_PreloadNextScreenshot( galleryid )
{
	var gallery = g_BlotterGalleries[galleryid];
	var getNext = false;
	var ssNext = null;
	for( var ss in gallery.shots )
	{
		if ( getNext )
		{
			ssNext = ss;
			break;
		}

		if ( ss == gallery.m_screenshotActive )
			getNext = true;
	}

	if ( ssNext != null )
	{
		var ssid = 'ssfs_img_' + galleryid + '_' + ssNext;
		// remove the resize part of the url, we'll just get the native size
		var imgurl = gallery.shots[ssNext].m_img.replace( /\/[^\/]*$/, '/' );
		$(ssid).src = imgurl;
		$(ssid).hide();
	}
}


function Blotter_PostStatus( textboxid, appboxid, posturl )
{
	new Ajax.Request( posturl, {
		insertion: Insertion.Bottom,
		method: 'post',
		parameters: { sessionid: g_sessionID, status_text: $(textboxid).value, appid: $(appboxid).value },
		onSuccess: function(transport) {
			// load more data
			var response = transport.responseJSON;
			if ( response && response.success == true && response.blotter_html )
			{
				// append the new day, having it fade in quickly
				$('blotter_day_' + response.timestart).update( response.blotter_html );
				$('blotter_day_' + response.timestart).hide();
				ShowWithFade( $('blotter_day_' + response.timestart) );
				$('blotter_statuspost_entry_error').hide();
			}
			else
			{
				// print out any error for now
				$('blotter_statuspost_entry_error').show();
				$('blotter_statuspost_entry_error').update( response.message );
			}
		},
		onFailure: function(transport) {
			// load more data
			var response = transport.responseJSON;
			// print out any error for now
			$('blotter_statuspost_entry_error').show();
			if ( response && response.message )
				$('blotter_statuspost_entry_error').update( response.message );
			else
				$('blotter_statuspost_entry_error').update( 'Posting status updates is unavailable right now' );
		}
	});

	// clear the input box
	$(textboxid).value = '';
	$(appboxid).value = 0;
	$('blotter_appselect_app_activeoption').update( 'TAG WITH GAME' );
}

function Blotter_DeletePostedStatus( postid, statusid, posturl )
{
	if ( !confirm( 'Delete this status update?' ) )
		return;

	new Ajax.Request( posturl, {
		insertion: Insertion.Bottom,
		method: 'post',
		parameters: { sessionid: g_sessionID, postid: postid },
		onSuccess: function(transport) {
			// load more data
			var response = transport.responseJSON;
			if ( response && response.success == true )
			{
				HideWithFade( $(statusid) );
			}
			else
			{
				// print out some error
				alert( 'failed to delete posted status' );
			}
		},
		onFailure: function(transport) {
			// print out some error
			alert( 'failed to delete posted status' );
		}
	});
}

function Blotter_SelectGame( gameid, gamename )
{
	// hide the menu that popped this up
	HideMenu( $('blotter_appselect_app'), $('blotter_appselect_app_options') );

	// remember the gameid
	$('blotter_poststatus_appid').value = gameid;

	var text = gamename;
	$('blotter_appselect_app_activeoption').innerHTML = text;
}

g_GameSuggestion = [];
function Blotter_GameSelector_Update()
{
	// build a new one
	var text = $('blotter_appselect_app_filter').value;
	if ( text.length == 0 )
	{
		// clear any existing
		$('blotter_appselect_suggestions').update('');

		for( var i=0, len=g_GameSuggestion.length; i < len; i++ )
		{
			var game = g_GameSuggestion[i];
			var el = new Element('div', { id: 'blotter_appselect_app_option_' + game.appid, 'class': 'option ellipsis' }).update( game.name );
			el.observe( 'click', Blotter_SelectGame.bind( null, game.appid, game.name ) );
			$('blotter_appselect_suggestions').appendChild( el );
		}
	}
	else
	{
		// get the list
		new Ajax.Request( 'http://steamcommunity.com/actions/SearchApps/' + encodeURIComponent( text ), {
			method: 'get',
			onSuccess: function(transport) {
						// update the list, if the text entered is still what we requested
						if ( text == $('blotter_appselect_app_filter').value )
						{
							$('blotter_appselect_suggestions').update('');
							var json = transport.responseJSON;
							if ( json && json.length )
							{
								for ( var i=0; i < json.length; i++ )
								{
									var elSuggestion = new Element( 'div', {'class': 'game_suggestion popup_menu_item' } );
									var el = new Element('div', { id: 'blotter_appselect_app_option_' + json[i].appid, 'class': 'option ellipsis' }).update( json[i].name );
									el.observe( 'click', Blotter_SelectGame.bind( null, json[i].appid, json[i].name ) );
									$('blotter_appselect_suggestions').appendChild( el );
								}
							}
						}
					}
		} );
	}
}

function Blotter_GiveFocus( id )
{
	window.setTimeout(function() {
		$(id).focus();
	   }, 50);
}

function Blotter_GameSelector_Hide()
{
	HideMenu( $('blotter_appselect_app'), $('blotter_appselect_app_options') );
}

function Blotter_GameSelector_Init()
{
	Blotter_GameSelector_Update();
	$('blotter_appselect_app_filter').observe( 'keyup', function( event ) { Blotter_GameSelector_Update() } );
}


function VoteUp(item_id)
{
	if ( !$('vote_up_' + item_id).hasClassName( 'active' ) )
	{
		var options = {
			method: 'post',
			postBody: 'id=' + item_id + '&sessionid=' + SESSION_ID,
			onComplete: (function(item_id){
				return function(transport)
				{
					$('vote_up_' + item_id).addClassName('active');
					$('vote_down_' + item_id).removeClassName('active');
				}
			}(item_id))
		};
		new Ajax.Request(
			'http://steamcommunity.com/sharedfiles/voteup',
			options
		);
	}
	return false;
}

function VoteDown(item_id)
{
	var options = {
		method: 'post',
		postBody: 'id=' + item_id + '&sessionid=' + SESSION_ID,
		onComplete: (function(item_id){
			return function(transport)
			{
				$('vote_up_' + item_id).removeClassName('active');
				$('vote_down_' + item_id).addClassName('active');
			}
		}(item_id))
	};
	new Ajax.Request(
		'http://steamcommunity.com/sharedfiles/votedown',
		options
	);

	return false;
}

function HideSpoilerCover(galleryid, screenshotid)
{
	if ( $('ss_spoiler_cover_' + galleryid) )
		HideWithFade($('ss_spoiler_cover_' + galleryid));

	if ( $('ss_thumb_spoiler_cover_' + screenshotid) )
		HideWithFade($('ss_thumb_spoiler_cover_' + screenshotid));
}

function ShowSpoilerCover(galleryid, screenshotid)
{
	if ( $('ss_spoiler_cover_' + galleryid) )
		ShowWithFade($('ss_spoiler_cover_' + galleryid));

	if ( $('ss_thumb_spoiler_cover_' + screenshotid) )
		ShowWithFade($('ss_thumb_spoiler_cover_' + screenshotid));
}


