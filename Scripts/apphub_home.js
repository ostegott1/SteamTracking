
var currentPage = 1;
var doneScrolling = false;
var modalDialogVisible = false;
var waitingForContent = false;

window.onbeforeunload = function()
{
	if ( window.history && window.history.replaceState )
	{
		var scrollOffset = document.viewport.getScrollOffsets();
		var scrollTop = scrollOffset.top;
		window.history.replaceState( {}, document.title, '#scrollTop=' + scrollTop );
	}
}

function PerformSearch()
{
	var searchText = v_trim( $( 'appHubsSearchText' ).value );
	if ( searchText.length < 3 && searchText.length > 0 )
	{
		$( 'appHubsSearchText' ).focus();
		alert( 'The search text must be at least 3 characters long.' );
		$( 'appHubsSearchText' ).value = searchText;
		return;
	}
	$('AppHubSearch').submit();
}

function PerformSearchOnKeypress( e )
{
	var e = e || event;
	var keyCode = e.keyCode;
	switch ( keyCode )
	{
		case Event.KEY_RETURN:
		{
			PerformSearch();
			Event.stop( e );
			return false;
		}
		break;
	}
	return true;
}

function ScrollToLastCancel()
{
	doneScrolling = true;
	hideModal( 'loadingPageModal' );
}

function ScrollToLast()
{
	if ( doneScrolling )
		return;

	if ( window.location.hash.length <= 1 )
		return;

	var hash = window.location.hash.substr(1);
	var params = hash.toQueryParams();
	var scrollTopPrevious = params['scrollTop'];
	if ( scrollTopPrevious && scrollTopPrevious > 0 )
	{
		var viewport = document.viewport.getDimensions(); // Gets the viewport as an object literal
		var windowHeight = viewport.height; // Usable window height
		var bodyHeight = $(document.body).getHeight();
		if ( scrollTopPrevious < bodyHeight - windowHeight )
		{
			window.scrollTo( 0, scrollTopPrevious) ;
			doneScrolling = true;
			hideModal( 'loadingPageModal' );
		}
		else
		{
			if ( !modalDialogVisible )
			{
				modalDialogVisible = true;
				showModal( 'loadingPageModal', true, false );
			}
		CheckForMoreContent();
		// continue scrolling, in case the user sees something interesting and wants to cancel
		window.scrollTo( 0, scrollTopPrevious );
		}
	}
}

function DoneWaitingForContent()
{
	waitingForContent = false;
	ScrollToLast();
	$( 'GetMoreContentBtn' ).show();
	$( 'action_wait' ).hide();
}

function CheckForMoreContent()
{
	if ( waitingForContent )
		return;

	if ( !$( 'MoreContentForm' + currentPage ) )
	{
		HideWithFade( $( 'GetMoreContentBtn' ) );
		ShowWithFade( $( 'NoMoreContent' ) );
		return;
	}
	waitingForContent = true;
	$( 'GetMoreContentBtn' ).hide();
	$( 'action_wait' ).show();
	$( 'MoreContentForm' + currentPage ).request( {
		onComplete: function( transport )
		{
			RecordAJAXPageView( transport.request.url );
		},
		onFailure: function()
		{
			DoneWaitingForContent();
		},
		onException: function()
		{
			DoneWaitingForContent();
		},
		onSuccess: function( transport )
		{

			currentPage++;
			var newDiv = new Element ( 'div' );
			newDiv.innerHTML = transport.responseText;
			$( 'AppHubCards' ).appendChild( newDiv );
			WaitForContentToLoad( currentPage );

			// no more content?
			if ( !$( 'MoreContentForm' + currentPage ) )
			{
				HideWithFade( $( 'GetMoreContentBtn' ) );
				ShowWithFade( $( 'NoMoreContent' ) );
			}
		}
	} );
}

function InfiniteScrollingCheckForMoreContent()
{
	var viewport = document.viewport.getDimensions(); // Gets the viewport as an object literal
	var windowHeight = viewport.height; // Usable window height

	var scrollOffset = document.viewport.getScrollOffsets();
	var scrollTop = scrollOffset.top;

	var bodyHeight = $(document.body).getHeight();

	// number of pixels from the bottom before checking for more content
	// this should be about two rows of content
	var buffer = 600;
	if ( scrollTop + buffer > bodyHeight - windowHeight )
	{
		CheckForMoreContent();
	}

	CalculateBackToTopButtonVisibility();
}

function SetLoadMoreContentProgressBar( progress, numSegments )
{
	var maxWidth = $('LoadingProgressBarContainer').getWidth();
	$('LoadingProgressBar').style.width = ( ( progress / numSegments ) * maxWidth ) + 'px';
}

function WaitForContentToLoad( page )
{
	function onPreviewImageLoaded()
	{
		numImagesLoaded++;
		SetLoadMoreContentProgressBar( numImagesLoaded, imagesLoading.length );
		if ( numImagesLoaded == imagesLoading.length )
		{
			ShowContent( page );
			SetLoadMoreContentProgressBar( 0, 1 );
		}
		else if ( numImagesLoaded > imagesLoading.length )
		{
			alert("should not happen");
		}
	}

	var imagesLoading = $$( '#page' + page + ' img.apphub_CardContentPreviewImage' );
	var numImagesLoaded = 0;
	var previewImages = [];
	for (i = 0; i < imagesLoading.length; ++i)
	{
		var img = imagesLoading[i];
		if ( img.width > 0 && img.height > 0 )
		{
			onPreviewImageLoaded( img );
		}
		else
		{
			var preview = new Image();
			preview.onload = function() { onPreviewImageLoaded.defer(); };
			preview.onerror = function() { onPreviewImageLoaded.defer(); };
			preview.src = img.src;
			img.preloadImage = preview;
			previewImages.push( preview );
		}
	}
	// if there are no images we have to wait for, just show the content on the page
	if ( imagesLoading.length == 0 )
	{
		ShowContent( page );
		SetLoadMoreContentProgressBar( 1, 1 );
	}
}

function ShowContent( page )
{
	var pageWidth = $('AppHubContent').getStyle('width');
	pageWidth = parseInt( pageWidth.substring( 0, pageWidth.length - 2 ) );
	var cardMargins = 1 * 2 + 2 * 5;
	var ogCards = $$( '#page' + page + ' div.apphub_Card' );

	var templates = ConstructDefaultRowTemplates( pageWidth, cardMargins );
	ShowAppHubCards( 'page' + page, ogCards, templates.rowTemplates, templates.fallbackTemplates, page, pageWidth, cardMargins, Number.MAX_VALUE );

	DoneWaitingForContent();
	ScrollToLast();
}

function CalculateBackToTopButtonVisibility()
{
	var scrollOffset = document.viewport.getScrollOffsets();
	var scrollTop = scrollOffset.top;
	// should we show the back to top button?
	var threshold = 600;
	if ( scrollTop > threshold )
	{
		ShowWithFade( $( 'BackToTop' ) );
	}
	else
	{
		HideWithFade( $( 'BackToTop' ) );
	}
}

function SelectContentFilter( url )
{
	HideMenu( $('filterselect'), $('filterselect_options') );

	window.location = url;
}